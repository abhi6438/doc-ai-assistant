"""
pdf_loader.py
-------------
Handles PDF text extraction and chunking.

Steps:
1. Receive a file path or bytes of a PDF
2. Extract raw text from each page using PyPDF
3. Split the full text into overlapping chunks (~500 chars)
   so that no context is lost at chunk boundaries
"""

import pypdf
import io
from typing import List


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extract all text from a PDF given its raw bytes.

    Args:
        file_bytes: Raw bytes of the uploaded PDF file.

    Returns:
        A single string containing all text from every page.
    """
    pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    full_text = []

    for page_num, page in enumerate(pdf_reader.pages):
        page_text = page.extract_text()
        if page_text:
            full_text.append(page_text)

    return "\n".join(full_text)


def split_text_into_chunks(
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> List[str]:
    """
    Split a long text string into overlapping chunks.

    Args:
        text:         The full document text.
        chunk_size:   Target size of each chunk in characters.
        chunk_overlap: Number of characters to repeat between
                       consecutive chunks to preserve context.

    Returns:
        A list of text chunk strings.
    """
    chunks = []
    start = 0
    text_length = len(text)

    while start < text_length:
        end = start + chunk_size

        # If not at the very end, try to break at a sentence or word boundary
        if end < text_length:
            # Prefer breaking at a newline or period within the last 100 chars
            break_point = text.rfind("\n", start, end)
            if break_point == -1 or break_point <= start:
                break_point = text.rfind(". ", start, end)
            if break_point == -1 or break_point <= start:
                break_point = text.rfind(" ", start, end)
            if break_point != -1 and break_point > start:
                end = break_point + 1   # include the space / newline

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Move start forward, stepping back by overlap so chunks share context
        start = end - chunk_overlap if end - chunk_overlap > start else end

    return chunks


def load_and_chunk_pdf(file_bytes: bytes) -> List[str]:
    """
    Convenience function: extract text then chunk it.

    Args:
        file_bytes: Raw bytes of the uploaded PDF.

    Returns:
        List of text chunks ready for embedding.
    """
    text = extract_text_from_pdf(file_bytes)
    chunks = split_text_into_chunks(text)
    return chunks
