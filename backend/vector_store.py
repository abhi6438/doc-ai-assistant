"""
vector_store.py
---------------
Manages ChromaDB interactions for storing and searching document embeddings.

ChromaDB runs entirely in-process / on disk — no external service needed.

Responsibilities:
- Initialize the ChromaDB client and "documents" collection
- Store text chunks with their embeddings and metadata
- Perform similarity search given a query embedding
"""

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any
import uuid
import os

# ---------------------------------------------------------------------------
# Embedding model
# ---------------------------------------------------------------------------
# all-MiniLM-L6-v2 is fast, lightweight (~80 MB) and works well for semantic
# similarity tasks. It produces 384-dimensional vectors.
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

# Lazy-load the model once and reuse it across requests
_embedding_model = None  # SentenceTransformer instance (lazy-loaded)


def get_embedding_model() -> SentenceTransformer:
    """Return the singleton SentenceTransformer instance."""
    global _embedding_model
    if _embedding_model is None:
        print(f"Loading embedding model: {EMBEDDING_MODEL_NAME} ...")
        _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        print("Embedding model loaded.")
    return _embedding_model


# ---------------------------------------------------------------------------
# ChromaDB client
# ---------------------------------------------------------------------------
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")
COLLECTION_NAME = "documents"

_chroma_client = None   # chromadb.PersistentClient instance (lazy-loaded)
_collection = None      # chromadb.Collection instance (lazy-loaded)


def get_chroma_collection():
    """
    Return (and lazily create) the persistent ChromaDB collection.

    The collection persists to disk so embeddings survive server restarts.
    """
    global _chroma_client, _collection
    if _chroma_client is None:
        # PersistentClient stores data on disk at CHROMA_PERSIST_DIR
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)

    if _collection is None:
        # get_or_create_collection is idempotent — safe to call on every startup
        _collection = _chroma_client.get_or_create_collection(
            name=COLLECTION_NAME,
            # Use cosine similarity for semantic search
            metadata={"hnsw:space": "cosine"},
        )

    return _collection


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Convert a list of text strings into embedding vectors.

    Args:
        texts: List of text strings to embed.

    Returns:
        List of float vectors (one per input text).
    """
    model = get_embedding_model()
    embeddings = model.encode(texts, show_progress_bar=False)
    # Convert numpy arrays to plain Python lists for ChromaDB compatibility
    return [emb.tolist() for emb in embeddings]


def store_chunks(chunks: List[str], doc_id: str) -> int:
    """
    Embed and store text chunks in ChromaDB.

    Args:
        chunks: List of text chunks extracted from a PDF.
        doc_id: Identifier for the source document (used as metadata).

    Returns:
        Number of chunks stored.
    """
    collection = get_chroma_collection()

    # Generate embeddings for all chunks in one batch (faster)
    embeddings = embed_texts(chunks)

    # Create unique IDs for each chunk so we can upsert safely
    ids = [f"{doc_id}_chunk_{i}_{uuid.uuid4().hex[:8]}" for i in range(len(chunks))]

    # Store text, embedding, and metadata together
    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,          # raw text stored alongside embedding
        metadatas=[{"doc_id": doc_id, "chunk_index": i} for i in range(len(chunks))],
    )

    return len(chunks)


def search_similar_chunks(
    query: str,
    n_results: int = 5,
) -> List[Dict[str, Any]]:
    """
    Find the most semantically similar chunks to the user's question.

    Args:
        query:     The user's question text.
        n_results: How many top chunks to return.

    Returns:
        List of dicts with keys: "text", "doc_id", "distance"
    """
    collection = get_chroma_collection()

    # Check if the collection has any documents
    if collection.count() == 0:
        return []

    # Embed the query using the same model used at ingestion time
    query_embedding = embed_texts([query])[0]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results, collection.count()),  # can't ask for more than stored
        include=["documents", "metadatas", "distances"],
    )

    # Flatten the nested lists returned by ChromaDB
    similar_chunks = []
    for text, metadata, distance in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        similar_chunks.append({
            "text": text,
            "doc_id": metadata.get("doc_id", "unknown"),
            "distance": distance,   # lower = more similar (cosine distance)
        })

    return similar_chunks


def delete_document_chunks(doc_id: str) -> None:
    """
    Remove all stored chunks belonging to a specific document.

    Args:
        doc_id: The document identifier used when storing chunks.
    """
    collection = get_chroma_collection()
    results = collection.get(where={"doc_id": doc_id})
    if results["ids"]:
        collection.delete(ids=results["ids"])
