"""
main.py
-------
FastAPI application entry point for Document AI Assistant.

Endpoints:
  POST /auth/request-otp  - Send 6-digit OTP to email
  POST /auth/verify-otp   - Verify OTP, get session token
  GET  /auth/me           - Check if session token is valid
  POST /upload            - Upload a PDF, extract text, embed, store in ChromaDB  (auth required)
  POST /ask               - Ask a question via RAG and get an LLM answer          (auth required)
  GET  /health            - Liveness probe
  GET  /admin/stats       - Usage analytics (protected by ADMIN_KEY)
  GET  /docs              - Auto-generated Swagger UI
"""

import os
import uuid
from dotenv import load_dotenv
load_dotenv()   # reads backend/.env on startup

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Query, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pdf_loader import load_and_chunk_pdf
from vector_store import store_chunks
from rag_service import answer_question, LLM_BACKEND
from analytics import log_event, get_stats
from auth import request_otp, verify_otp, get_session, list_users

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Document AI Assistant",
    description="Upload PDFs and ask questions via RAG + ChromaDB + Groq/OpenAI.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ADMIN_KEY = os.getenv("ADMIN_KEY", "admin123")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class OTPRequest(BaseModel):
    email: str

class OTPVerifyRequest(BaseModel):
    email: str
    otp: str

class AuthResponse(BaseModel):
    token: str
    email: str
    dev_mode: bool = False

class AskRequest(BaseModel):
    question: str

class AskResponse(BaseModel):
    answer: str
    sources: list[str]
    backend: str

class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    chunks_stored: int
    message: str

class HealthResponse(BaseModel):
    status: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_client_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For from proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def require_auth(x_auth_token: str = Header(default="")) -> dict:
    """FastAPI dependency — validates session token from X-Auth-Token header."""
    session = get_session(x_auth_token)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please verify your email to use this service.",
        )
    return session


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@app.post("/auth/request-otp", tags=["Auth"])
def request_otp_endpoint(body: OTPRequest):
    """
    Send a 6-digit OTP to the provided email address.
    If EMAIL_USER/EMAIL_PASS are not configured, OTP is printed to server console (dev mode).
    """
    email = body.email.strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")
    try:
        sent = request_otp(email)
        return {
            "sent":     sent,
            "dev_mode": not sent,
            "message":  "Verification code sent to your email."
                        if sent else
                        "Dev mode: check the server console for your OTP.",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send code: {str(exc)}")


@app.post("/auth/verify-otp", response_model=AuthResponse, tags=["Auth"])
def verify_otp_endpoint(body: OTPVerifyRequest):
    """Verify the OTP and return a 24-hour session token."""
    try:
        token = verify_otp(body.email, body.otp)
        return AuthResponse(token=token, email=body.email.strip().lower())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/auth/me", tags=["Auth"])
def get_me(x_auth_token: str = Header(default="")):
    """Check if the provided session token is still valid."""
    session = get_session(x_auth_token)
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated or session expired.")
    return {"email": session["email"], "created_at": session["created_at"]}


# ---------------------------------------------------------------------------
# Core endpoints (auth-protected)
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["Utility"])
def health_check():
    """Liveness probe for Render / Vercel health checks."""
    return {"status": "ok"}


@app.post("/upload", response_model=UploadResponse, tags=["Documents"])
async def upload_pdf(
    request: Request,
    file: UploadFile = File(...),
    session: dict = Depends(require_auth),
):
    """
    Upload a document (PDF, DOCX, TXT). Requires email verification.
    Extracts text -> chunks -> embeddings -> ChromaDB.
    """
    ext = (file.filename or "").lower().split(".")[-1]
    if ext not in ("pdf", "docx", "txt"):
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, and TXT files are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        chunks = load_and_chunk_pdf(file_bytes)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {str(exc)}")

    if not chunks:
        raise HTTPException(
            status_code=422,
            detail="No text could be extracted. The file may be a scanned image.",
        )

    safe_name = (file.filename or "doc").replace(" ", "_").rsplit(".", 1)[0]
    doc_id    = f"{safe_name}_{uuid.uuid4().hex[:8]}"

    try:
        num_chunks = store_chunks(chunks, doc_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to store embeddings: {str(exc)}")

    log_event("document_upload", {
        "filename":      file.filename,
        "file_size":     len(file_bytes),
        "chunks_stored": num_chunks,
        "doc_id":        doc_id,
        "user_email":    session["email"],
    }, client_ip=get_client_ip(request))

    return UploadResponse(
        doc_id=doc_id,
        filename=file.filename,
        chunks_stored=num_chunks,
        message=f"Successfully processed '{file.filename}' into {num_chunks} chunks.",
    )


@app.post("/ask", response_model=AskResponse, tags=["Q&A"])
def ask_question_endpoint(
    body: AskRequest,
    request: Request,
    session: dict = Depends(require_auth),
):
    """
    Answer a question using RAG. Requires email verification.
    Retrieves relevant chunks from ChromaDB, then calls the LLM.
    """
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        result = answer_question(question)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error generating answer: {str(exc)}")

    log_event("question_asked", {
        "question":      question,
        "answer_length": len(result.get("answer", "")),
        "sources_count": len(result.get("sources", [])),
        "backend":       result.get("backend", LLM_BACKEND),
        "user_email":    session["email"],
    }, client_ip=get_client_ip(request))

    return AskResponse(
        answer=result["answer"],
        sources=result["sources"],
        backend=result["backend"],
    )


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

@app.get("/admin/stats", tags=["Admin"])
def admin_stats(key: str = Query(default="")):
    """
    Usage analytics dashboard data. Protected by ADMIN_KEY (set in .env).
    Access: GET /admin/stats?key=YOUR_ADMIN_KEY

    Returns summary counts, 7-day chart, top questions, recent activity,
    and the list of registered (email-verified) users.
    """
    if key != ADMIN_KEY:
        raise HTTPException(
            status_code=403,
            detail="Invalid admin key. Set ADMIN_KEY in .env and pass ?key=YOUR_KEY",
        )
    data = get_stats()
    data["registered_users"] = list_users()
    return data
