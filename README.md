# Document AI Assistant

A full-stack **Retrieval-Augmented Generation (RAG)** demo application.

Users upload PDF documents, ask questions in a chat interface, and receive answers grounded in the document content — powered by ChromaDB, sentence-transformers, and OpenAI (or a local LLM).

---

## Architecture

```
User Browser
    │
    ▼
React Frontend (port 3000)
    │  POST /upload  →  PDF bytes
    │  POST /ask     →  question text
    ▼
FastAPI Backend (port 8000)
    ├── pdf_loader.py      Extract text, chunk into ~500 char pieces
    ├── vector_store.py    Embed chunks (all-MiniLM-L6-v2) → ChromaDB
    └── rag_service.py     Similarity search → RAG prompt → LLM → answer
```

---

## Project Structure

```
project-root/
├── backend/
│   ├── main.py            FastAPI app — /upload and /ask endpoints
│   ├── rag_service.py     RAG pipeline: retrieve + prompt + LLM call
│   ├── vector_store.py    ChromaDB init, embed, store, search
│   ├── pdf_loader.py      PDF text extraction and chunking
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js         Root component + layout
│   │   ├── App.css        All styles (dark theme)
│   │   ├── Upload.js      Drag-and-drop PDF upload
│   │   ├── Chat.js        Chat interface with RAG responses
│   │   └── index.js       React entry point
│   └── package.json
└── README.md
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Node.js | 18+ |
| npm | 9+ |

---

## Local Setup

### 1. Clone / navigate to the project

```bash
cd project-root
```

### 2. Backend

```bash
cd backend

# Create and activate a virtual environment (recommended)
python -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Set your OpenAI API key
export OPENAI_API_KEY="sk-..."  # macOS / Linux
# set OPENAI_API_KEY=sk-...     # Windows cmd

# Start the API server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000/docs](http://localhost:8000/docs) to explore the Swagger UI.

### 3. Frontend

```bash
cd frontend

# Install packages
npm install

# Start the dev server
npm start
```

Open [http://localhost:3000](http://localhost:3000) — the app is ready.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | *(required)* | Your OpenAI secret key |
| `OPENAI_MODEL` | `gpt-4o-mini` | Any OpenAI chat model |
| `LLM_BACKEND` | `openai` | `openai` or `local` (Ollama) |
| `OLLAMA_MODEL` | `llama3` | Ollama model name |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `TOP_K_RESULTS` | `5` | Number of chunks sent to LLM |
| `REACT_APP_API_URL` | *(empty)* | Backend base URL for production builds |

---

## Switching to a Local LLM (no OpenAI key needed)

1. Install [Ollama](https://ollama.com/download)
2. Pull a model: `ollama pull llama3`
3. Start the server: `ollama serve`
4. Set the backend env vars:

```bash
export LLM_BACKEND=local
export OLLAMA_MODEL=llama3
```

---

## How It Works

### Upload flow (`POST /upload`)

```
PDF file bytes
    └─► pdf_loader.extract_text_from_pdf()   — PyPDF
    └─► split_text_into_chunks(size=500)     — overlapping ~50 char windows
    └─► vector_store.embed_texts()           — all-MiniLM-L6-v2 → 384-dim vectors
    └─► chromadb.collection.add()            — persisted to ./backend/chroma_db/
```

### Ask flow (`POST /ask`)

```
User question
    └─► embed question                       — same model
    └─► chromadb.collection.query(top_k=5)  — cosine similarity
    └─► build RAG prompt
            ┌──────────────────────────────────────────┐
            │ CONTEXT: <chunk 1> ... <chunk 5>         │
            │ QUESTION: What is the refund policy?     │
            │ ANSWER:                                  │
            └──────────────────────────────────────────┘
    └─► LLM (OpenAI / Ollama)
    └─► { answer, sources } → frontend
```

---

## Deployment

### Backend on Render (free tier)

1. Push your `backend/` folder to a GitHub repository.
2. Go to [render.com](https://render.com) → **New Web Service**.
3. Select the repo; set:
   - **Runtime**: Python 3
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables in the Render dashboard:
   - `OPENAI_API_KEY` = your key
5. Deploy — Render provides a public HTTPS URL.

> **Note on ChromaDB persistence**: Render's free tier uses ephemeral disk.
> For production, swap ChromaDB for a managed vector DB (Pinecone, Weaviate, etc.)
> or mount a persistent disk in Render.

### Frontend on Vercel

1. Push your `frontend/` folder (or the whole repo) to GitHub.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import repo.
3. Set:
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Output directory**: `build`
4. Add environment variable:
   - `REACT_APP_API_URL` = `https://your-backend.onrender.com`
5. Deploy — Vercel provides a public HTTPS URL.

---

## Demo Workflow (for AI interviews)

| Step | Action |
|------|--------|
| 1 | Open the app at `http://localhost:3000` |
| 2 | Drag-and-drop a PDF (e.g. a company policy doc) into the upload zone |
| 3 | Wait for "X chunks indexed" confirmation |
| 4 | Type a question: *"What is the refund policy?"* |
| 5 | AI returns an answer grounded in the document |
| 6 | Expand "N source excerpts" to show the retrieved passages |

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Axios, react-dropzone, react-markdown |
| Backend | Python, FastAPI, Uvicorn |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` |
| Vector DB | ChromaDB (local, persistent) |
| LLM (default) | OpenAI `gpt-4o-mini` |
| LLM (local) | Ollama (`llama3` or any compatible model) |
| PDF parsing | PyPDF |
