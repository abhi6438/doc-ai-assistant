"""
vector_store.py
---------------
Manages ChromaDB interactions for storing and searching document embeddings.

ChromaDB runs entirely in-process / on disk — no external service needed.

Each user's chunks are stored with their email in metadata so:
  - Upload  → deletes only THAT user's old chunks, then stores new ones
  - Search  → returns only THAT user's chunks (other users' docs are invisible)
  - Two users logged in simultaneously never interfere with each other
"""

import chromadb
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any
import uuid
import os

# ---------------------------------------------------------------------------
# Embedding model
# ---------------------------------------------------------------------------
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

_embedding_model = None   # lazy-loaded singleton


def get_embedding_model() -> SentenceTransformer:
    """Return the singleton SentenceTransformer instance (loaded once)."""
    global _embedding_model
    if _embedding_model is None:
        print(f"Loading embedding model: {EMBEDDING_MODEL_NAME} ...")
        _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        print("Embedding model loaded.")
    return _embedding_model


# ---------------------------------------------------------------------------
# ChromaDB client — single shared collection, users separated by metadata
# ---------------------------------------------------------------------------
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")
COLLECTION_NAME    = "documents"

_chroma_client = None   # lazy-loaded
_collection    = None   # lazy-loaded


def get_chroma_collection():
    """Return (and lazily create) the shared ChromaDB collection."""
    global _chroma_client, _collection
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
    if _collection is None:
        _collection = _chroma_client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def embed_texts(texts: List[str]) -> List[List[float]]:
    """Convert a list of text strings into embedding vectors."""
    model = get_embedding_model()
    embeddings = model.encode(texts, show_progress_bar=False)
    return [emb.tolist() for emb in embeddings]


def clear_user_chunks(user_email: str) -> None:
    """
    Delete ALL chunks that belong to a specific user.

    Called before every upload so the user always starts fresh with their
    new document — their old chunks are gone, but other users are unaffected.
    """
    collection = get_chroma_collection()
    results = collection.get(where={"user_email": user_email})
    if results["ids"]:
        collection.delete(ids=results["ids"])
        print(f"[vector_store] Cleared {len(results['ids'])} old chunks for {user_email}")


def store_chunks(chunks: List[str], doc_id: str, user_email: str) -> int:
    """
    Embed and store text chunks in ChromaDB, tagged with the user's email.

    Args:
        chunks:     Text chunks extracted from the uploaded document.
        doc_id:     Unique identifier for this document.
        user_email: Email of the user who uploaded the document.

    Returns:
        Number of chunks stored.
    """
    collection = get_chroma_collection()

    embeddings = embed_texts(chunks)

    ids = [f"{doc_id}_chunk_{i}_{uuid.uuid4().hex[:8]}" for i in range(len(chunks))]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,
        # Store both doc_id and user_email so we can filter by either
        metadatas=[
            {"doc_id": doc_id, "chunk_index": i, "user_email": user_email}
            for i in range(len(chunks))
        ],
    )

    return len(chunks)


def search_similar_chunks(
    query: str,
    user_email: str,
    n_results: int = 5,
) -> List[Dict[str, Any]]:
    """
    Find chunks most similar to the query, restricted to the given user's docs.

    Args:
        query:      The user's question.
        user_email: Only search chunks uploaded by this user.
        n_results:  How many top chunks to return.

    Returns:
        List of dicts with keys: "text", "doc_id", "distance"
    """
    collection = get_chroma_collection()

    if collection.count() == 0:
        return []

    # Count how many chunks this user actually has
    user_chunks = collection.get(where={"user_email": user_email})
    user_count  = len(user_chunks["ids"])

    if user_count == 0:
        return []   # user hasn't uploaded anything yet

    query_embedding = embed_texts([query])[0]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results, user_count),
        where={"user_email": user_email},   # ← key: only this user's chunks
        include=["documents", "metadatas", "distances"],
    )

    similar_chunks = []
    for text, metadata, distance in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        similar_chunks.append({
            "text":   text,
            "doc_id": metadata.get("doc_id", "unknown"),
            "distance": distance,
        })

    return similar_chunks
