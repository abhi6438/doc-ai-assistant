"""
rag_service.py
--------------
Retrieval-Augmented Generation (RAG) pipeline.

Supported LLM backends (set via LLM_BACKEND env var):
  groq   → Groq API — FREE tier, blazing fast, Llama 3 / Mixtral   ← DEFAULT
  openai → OpenAI GPT-4o-mini (paid, requires OPENAI_API_KEY)
  local  → Ollama running locally (free, requires GPU or patience)

Get a FREE Groq API key at: https://console.groq.com
"""

import os
from typing import List, Dict, Any

from vector_store import search_similar_chunks

# ---------------------------------------------------------------------------
# Configuration — all values come from environment variables
# ---------------------------------------------------------------------------

# Which LLM provider to use.  Default = groq (free, no credit card needed)
LLM_BACKEND = os.getenv("LLM_BACKEND", "groq")

# ── Groq (free) ──────────────────────────────────────────────────────────────
GROQ_API_KEY   = os.getenv("GROQ_API_KEY", "")
# Available free Groq models (pick the fastest that fits your use case):
#   llama-3.1-8b-instant       ← fastest,  good quality
#   llama-3.3-70b-versatile    ← best quality, slightly slower
#   mixtral-8x7b-32768         ← long context window
#   gemma2-9b-it               ← Google's Gemma 2
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

# ── OpenAI (paid) ─────────────────────────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL   = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# ── Ollama (local) ────────────────────────────────────────────────────────────
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "llama3")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# How many retrieved chunks to include in the prompt
TOP_K_RESULTS = int(os.getenv("TOP_K_RESULTS", "5"))

# System message used with all chat-based providers
SYSTEM_PROMPT = (
    "You are a strict document Q&A assistant. "
    "You ONLY answer questions based on the document context provided to you. "
    "You do NOT use any outside knowledge. "
    "If the question is not covered by the document, you say so clearly and "
    "tell the user what topics the document does cover. "
    "Use markdown formatting where helpful (bullet points, bold key terms)."
)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def build_rag_prompt(question: str, context_chunks: List[str]) -> str:
    """
    Build the RAG prompt sent to the LLM.

    The prompt enforces strict document-only answers:
    - If the question is answered by the context → give the answer
    - If the question is NOT related to the context → tell the user what
      topics the document does cover so they can ask a relevant question
    """
    context = "\n\n---\n\n".join(context_chunks)
    return (
        f"You are a document Q&A assistant. Your job is to answer questions "
        f"STRICTLY based on the document context below. Do NOT use any outside knowledge.\n\n"
        f"RULES:\n"
        f"1. If the question is answered by the context, give a clear and accurate answer.\n"
        f"2. If the question is NOT related to the document, respond with:\n"
        f'   "This question is not covered in the uploaded document. '
        f"Based on the document, I can help you with topics such as: [list 3-5 key topics "
        f'from the context]."\n'
        f"3. Never make up information. Never use knowledge outside the context.\n\n"
        f"DOCUMENT CONTEXT:\n{context}\n\n"
        f"USER QUESTION:\n{question}\n\n"
        f"ANSWER:"
    )


# ---------------------------------------------------------------------------
# Backend implementations
# ---------------------------------------------------------------------------

def _call_groq(prompt: str) -> str:
    """
    Call the Groq API — completely FREE tier available.

    Steps to get started:
      1. Go to https://console.groq.com
      2. Sign up (no credit card required)
      3. Create an API key
      4. export GROQ_API_KEY="gsk_..."
    """
    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is not set.\n"
            "Get a free key at https://console.groq.com and run:\n"
            "  export GROQ_API_KEY='gsk_...'"
        )

    try:
        from groq import Groq
    except ImportError:
        raise RuntimeError(
            "groq package not installed. Run: pip install groq"
        )

    client = Groq(api_key=GROQ_API_KEY)

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        temperature=0.2,
        max_tokens=1024,
    )

    return response.choices[0].message.content.strip()


def _call_openai(prompt: str) -> str:
    """Call the OpenAI Chat Completions API (paid — requires OPENAI_API_KEY)."""
    if not OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. "
            "Set it or switch to LLM_BACKEND=groq (free)."
        )

    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("openai package not installed. Run: pip install openai")

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        temperature=0.2,
        max_tokens=1024,
    )
    return response.choices[0].message.content.strip()


def _call_local_ollama(prompt: str) -> str:
    """
    Call a locally running Ollama instance (fully free, runs on your machine).

    Setup:
      1. Install Ollama: https://ollama.com/download
      2. Pull a model:   ollama pull llama3
      3. Start server:   ollama serve
      4. export LLM_BACKEND=local
    """
    try:
        import requests
    except ImportError:
        raise RuntimeError("requests package not installed.")

    response = requests.post(
        f"{OLLAMA_BASE_URL}/api/generate",
        json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
              "options": {"temperature": 0.2}},
        timeout=120,
    )
    response.raise_for_status()
    return response.json().get("response", "").strip()


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

def call_llm(prompt: str) -> str:
    """Route to the appropriate LLM backend based on LLM_BACKEND env var."""
    if LLM_BACKEND == "groq":
        return _call_groq(prompt)
    elif LLM_BACKEND == "local":
        return _call_local_ollama(prompt)
    else:
        return _call_openai(prompt)


# ---------------------------------------------------------------------------
# Main RAG pipeline
# ---------------------------------------------------------------------------

def answer_question(question: str) -> Dict[str, Any]:
    """
    End-to-end RAG pipeline:
      1. Embed the user's question
      2. Retrieve the top-K most similar document chunks from ChromaDB
      3. Assemble a RAG prompt (context + question)
      4. Send prompt to the LLM and get an answer
      5. Return answer + source excerpts (shown in UI)
    """
    # Step 1 + 2: semantic search in ChromaDB
    similar_chunks = search_similar_chunks(question, n_results=TOP_K_RESULTS)

    if not similar_chunks:
        return {
            "answer": (
                "No documents have been uploaded yet. "
                "Please upload a PDF, DOCX, or TXT file before asking questions."
            ),
            "sources": [],
            "backend": LLM_BACKEND,
        }

    context_texts = [chunk["text"] for chunk in similar_chunks]

    # Step 3: build prompt
    prompt = build_rag_prompt(question, context_texts)

    # Step 4: call LLM
    answer = call_llm(prompt)

    return {
        "answer":  answer,
        "sources": context_texts,   # UI shows these as collapsible source excerpts
        "backend": LLM_BACKEND,
    }
