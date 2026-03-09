"""
main.py — FastAPI application entry point
------------------------------------------
All HTTP endpoints for the Document AI Assistant backend.

Auth endpoints (no token required):
  POST /auth/request-otp   Send a 6-digit OTP to the user's email
  POST /auth/verify-otp    Verify the OTP, receive a session token
  GET  /auth/me            Check whether a session token is still valid

Document endpoints (session token required via X-Auth-Token header):
  POST /upload             Upload a PDF/DOCX/TXT → extract text → store in ChromaDB
  POST /ask                Ask a question → RAG search → LLM answer

Utility:
  GET  /health             Simple liveness probe (used by hosting platforms)
  GET  /admin/stats        Usage analytics — protected by ADMIN_KEY query param
  GET  /docs               Auto-generated Swagger UI (from FastAPI)
"""

import os
import uuid
from collections import defaultdict
from datetime import datetime, timedelta

from dotenv import load_dotenv
load_dotenv()   # Load environment variables from backend/.env (local dev only)

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Query, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Internal modules
from pdf_loader  import load_and_chunk_pdf
from vector_store import store_chunks, clear_all_chunks
from rag_service  import answer_question, LLM_BACKEND
from analytics    import log_event, get_stats
from auth         import request_otp, verify_otp, get_session, list_users


# ── App setup ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Document AI Assistant",
    description="Upload PDFs and ask questions via RAG + ChromaDB + Groq/OpenAI.",
    version="2.0.0",
)

# Allow requests from the React frontend (localhost for dev, * for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Admin key for the /admin/stats endpoint — set via ADMIN_KEY env var
ADMIN_KEY = os.getenv("ADMIN_KEY", "admin123")


# ── Request / Response schemas ─────────────────────────────────────────────

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


# ── Helpers ────────────────────────────────────────────────────────────────

def get_client_ip(request: Request) -> str:
    """Extract the real client IP, accounting for reverse-proxy headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Rate limiter: max 3 OTP requests per email per 10-minute window (in-memory)
_otp_rate: dict = defaultdict(list)   # email → list of request timestamps

def _check_otp_rate(email: str) -> None:
    """Raise HTTP 429 if the email has exceeded the OTP request rate limit."""
    now    = datetime.utcnow()
    window = now - timedelta(minutes=10)
    # Remove timestamps outside the current window
    _otp_rate[email] = [t for t in _otp_rate[email] if t > window]
    if len(_otp_rate[email]) >= 3:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait 10 minutes before requesting another code.",
        )
    _otp_rate[email].append(now)


def require_auth(x_auth_token: str = Header(default="")) -> dict:
    """
    FastAPI dependency that enforces email verification.

    Reads X-Auth-Token from the request header, validates the session,
    and returns the session dict so endpoints know which user is calling.
    Raises HTTP 401 if the token is missing or expired.
    """
    session = get_session(x_auth_token)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please verify your email to use this service.",
        )
    return session


# ── Auth endpoints ─────────────────────────────────────────────────────────

@app.post("/auth/request-otp", tags=["Auth"])
def request_otp_endpoint(body: OTPRequest):
    """
    Step 1 of login: generate and email a 6-digit OTP.
    Rate-limited to 3 requests per email per 10 minutes.
    """
    email = body.email.strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")

    _check_otp_rate(email)

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
    """
    Step 2 of login: verify the OTP and receive a session token.
    The token must be included as X-Auth-Token in all subsequent requests.
    """
    try:
        token = verify_otp(body.email, body.otp)
        return AuthResponse(token=token, email=body.email.strip().lower())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/auth/me", tags=["Auth"])
def get_me(x_auth_token: str = Header(default="")):
    """
    Check whether the current session token is valid.
    The frontend calls this on page load to decide whether to show the auth gate.
    """
    session = get_session(x_auth_token)
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated or session expired.")
    return {"email": session["email"], "created_at": session["created_at"]}


# ── Utility ────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["Utility"])
def health_check():
    """Liveness probe — used by HuggingFace Spaces / Render to check the app is running."""
    return {"status": "ok"}


# ── Document endpoints (require email verification) ────────────────────────

@app.post("/upload", response_model=UploadResponse, tags=["Documents"])
async def upload_pdf(
    request: Request,
    file: UploadFile = File(...),
    session: dict = Depends(require_auth),   # enforces email verification
):
    """
    Upload a document (PDF, DOCX, or TXT).

    Processing pipeline:
      1. Read the file bytes
      2. Extract plain text (via PyPDF for PDFs)
      3. Split text into overlapping ~500-character chunks
      4. Embed each chunk using sentence-transformers (all-MiniLM-L6-v2)
      5. Store embeddings + text in ChromaDB for later retrieval
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

    # Clear all previous document chunks so only the new upload is in the store.
    # Without this, old documents accumulate and pollute search results.
    clear_all_chunks()

    # Create a unique document ID from the filename + a short random suffix
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
    session: dict = Depends(require_auth),   # enforces email verification
):
    """
    Answer a question using the RAG pipeline.

    Steps:
      1. Embed the question using the same model used at upload time
      2. Find the top-K most similar chunks in ChromaDB (semantic search)
      3. Build a prompt: retrieved context + question
      4. Send the prompt to the configured LLM (Groq by default — free)
      5. Return the answer + source excerpts shown in the UI
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


# ── Admin ──────────────────────────────────────────────────────────────────

@app.get("/admin/stats", tags=["Admin"])
def admin_stats(key: str = Query(default="")):
    """
    Returns usage analytics for the admin dashboard.
    Protected by the ADMIN_KEY environment variable.

    Access: GET /admin/stats?key=YOUR_ADMIN_KEY

    Response includes:
      - Summary counts (uploads, questions, unique users)
      - Daily usage chart for the last 7 days
      - Top 10 most-asked questions
      - 20 most recent events
      - List of email-verified users
    """
    if key != ADMIN_KEY:
        raise HTTPException(
            status_code=403,
            detail="Invalid admin key. Pass ?key=YOUR_ADMIN_KEY",
        )
    data = get_stats()
    data["registered_users"] = list_users()   # verified users from auth module
    return data
