---
title: Doc AI Assistant
emoji: 🤖
colorFrom: indigo
colorTo: purple
sdk: docker
app_file: app.py
pinned: false
---

# Document AI Assistant

An AI-powered SaaS application — upload PDFs and ask questions in natural language.
Answers are grounded in your document using **RAG (Retrieval-Augmented Generation)**.

## Live Demo

| Service | URL |
|---------|-----|
| **Frontend** | https://doc-ai-assistant.vercel.app |
| **Backend API** | https://abhi6438-doc-ai-backend.hf.space |
| **API Docs** | https://abhi6438-doc-ai-backend.hf.space/docs |
| **Health Check** | https://abhi6438-doc-ai-backend.hf.space/health |

---

## Features

- **Email OTP verification** — users must verify their email before accessing the app
- **PDF / DOCX / TXT upload** — drag-and-drop document ingestion
- **Semantic search** — ChromaDB + sentence-transformers embeddings
- **RAG Q&A** — Groq LLM (free, no credit card) answers from your document
- **Admin analytics** — track uploads, questions, and registered users
- **Dark mode** — full light/dark theme support
- **Mobile-friendly** — responsive layout with bottom tab navigation

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TailwindCSS, Framer Motion, Lucide React |
| Backend | Python, FastAPI, Uvicorn |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` |
| Vector DB | ChromaDB (local, persistent) |
| LLM | Groq (`llama-3.1-8b-instant`) — free tier |
| Auth | Email OTP via Gmail SMTP |
| PDF parsing | PyPDF |

---

## Architecture

```
User Browser
    │  (must verify email via OTP first)
    ▼
React Frontend — Vercel
    │  POST /auth/request-otp  →  sends email OTP
    │  POST /auth/verify-otp   →  returns session token
    │  POST /upload            →  PDF bytes  (auth required)
    │  POST /ask               →  question   (auth required)
    ▼
FastAPI Backend — HuggingFace Spaces
    ├── auth.py          Email OTP + session management
    ├── analytics.py     Event logging (JSONL)
    ├── pdf_loader.py    Extract text, chunk into ~500 char pieces
    ├── vector_store.py  Embed chunks → ChromaDB
    └── rag_service.py   Similarity search → RAG prompt → Groq LLM
```

---

## Project Structure

```
doc-ai-assistant/
├── backend/
│   ├── main.py            FastAPI app — all endpoints
│   ├── auth.py            Email OTP authentication
│   ├── analytics.py       Usage tracking (JSONL)
│   ├── rag_service.py     RAG pipeline + Groq/OpenAI/Ollama
│   ├── vector_store.py    ChromaDB init, embed, store, search
│   ├── pdf_loader.py      PDF/DOCX/TXT extraction and chunking
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── public/index.html
│   ├── src/
│   │   ├── App.js                    Root + auth gate
│   │   ├── components/
│   │   │   ├── AuthGate.js           Email OTP verification screen
│   │   │   ├── Navbar.js             Top navigation
│   │   │   ├── FileUploader.js       Drag-and-drop upload
│   │   │   ├── DocumentList.js       Uploaded docs list
│   │   │   ├── ChatWindow.js         Chat interface
│   │   │   ├── ChatMessage.js        Message bubbles + Markdown
│   │   │   ├── ChatInput.js          Input bar + suggestions
│   │   │   └── StatsPanel.js         Admin analytics dashboard
│   │   └── index.css                 TailwindCSS + glassmorphism styles
│   ├── tailwind.config.js
│   └── package.json
├── render.yaml            Render.com deployment config
└── README.md
```

---

## Local Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in your keys
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm start                       # runs on http://localhost:3000
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `LLM_BACKEND` | `groq` / `openai` / `local` |
| `GROQ_API_KEY` | Free key from console.groq.com |
| `GROQ_MODEL` | e.g. `llama-3.1-8b-instant` |
| `ADMIN_KEY` | Password for `/admin/stats` endpoint |
| `EMAIL_HOST` | SMTP host (e.g. `smtp.gmail.com`) |
| `EMAIL_PORT` | SMTP port (e.g. `587`) |
| `EMAIL_USER` | Gmail address |
| `EMAIL_PASS` | Gmail App Password |
| `TOP_K_RESULTS` | Chunks sent to LLM (default `5`) |

### Frontend

| Variable | Description |
|----------|-------------|
| `REACT_APP_API_URL` | Backend URL (e.g. `https://abhi6438-doc-ai-backend.hf.space`) |

---

## Admin Analytics

Access the analytics dashboard:
- In the app: click the **Bell** icon or **Analytics** in the user menu
- Direct API: `GET https://abhi6438-doc-ai-backend.hf.space/admin/stats?key=YOUR_ADMIN_KEY`

Shows: uploads, questions, unique users, 7-day chart, registered users list, recent activity.
