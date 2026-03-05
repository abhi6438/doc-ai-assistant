/**
 * Upload.js — PDF upload component
 *
 * Features:
 * - Drag-and-drop or click-to-browse file selection (react-dropzone)
 * - Sends file to POST /upload via axios
 * - Shows uploading / success / error status
 * - Displays list of uploaded documents with chunk count
 */

import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";

// Base URL for the FastAPI backend.
// In development the proxy in package.json forwards /upload → localhost:8000
// In production set REACT_APP_API_URL in your environment.
const API_URL = process.env.REACT_APP_API_URL || "";

export default function Upload({ onDocumentUploaded, uploadedDocs }) {
  const [status, setStatus] = useState(null); // null | "uploading" | "success" | "error"
  const [message, setMessage] = useState("");

  // ── Handle file drop / selection ─────────────────────────
  const onDrop = useCallback(
    async (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // Validate client-side before sending
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setStatus("error");
        setMessage("Please upload a PDF file.");
        return;
      }

      setStatus("uploading");
      setMessage(`Uploading "${file.name}" …`);

      try {
        // Build multipart/form-data payload
        const formData = new FormData();
        formData.append("file", file);

        // POST /upload — FastAPI receives the file, embeds it, stores in ChromaDB
        const response = await axios.post(`${API_URL}/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120_000, // 2-minute timeout for large PDFs
        });

        const { doc_id, filename, chunks_stored } = response.data;

        setStatus("success");
        setMessage(
          `"${filename}" processed — ${chunks_stored} chunks indexed.`
        );

        // Notify parent (App.js) so it can update state
        onDocumentUploaded({ doc_id, filename, chunks_stored });
      } catch (err) {
        setStatus("error");
        const detail =
          err.response?.data?.detail ||
          err.message ||
          "Upload failed. Check the backend is running.";
        setMessage(detail);
      }
    },
    [onDocumentUploaded]
  );

  // ── Dropzone configuration ───────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,        // one file at a time
    disabled: status === "uploading",
  });

  return (
    <div className="card">
      <h2>Upload Document</h2>

      {/* Drag-and-drop zone */}
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? "active" : ""}`}
      >
        <input {...getInputProps()} />
        <div className="dropzone-icon">📄</div>
        {isDragActive ? (
          <p>Drop the PDF here…</p>
        ) : (
          <p>
            <span>Click to browse</span> or drag &amp; drop a PDF
          </p>
        )}
      </div>

      {/* Upload status feedback */}
      {status && (
        <div className={`upload-status ${status}`}>
          {status === "uploading" && <span className="spinner" />}
          {status === "success" && <span>✅</span>}
          {status === "error" && <span>❌</span>}
          <span>{message}</span>
        </div>
      )}

      {/* List of uploaded documents */}
      {uploadedDocs.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2>Indexed Documents</h2>
          <ul className="doc-list">
            {uploadedDocs.map((doc) => (
              <li key={doc.doc_id}>
                <span className="doc-icon">📕</span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 160,
                  }}
                  title={doc.filename}
                >
                  {doc.filename}
                </span>
                <span className="chunks">{doc.chunks_stored} chunks</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tips */}
      {uploadedDocs.length === 0 && (
        <p
          style={{
            marginTop: 14,
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.7,
          }}
        >
          Tip: Upload a PDF contract, manual, or report. Then ask questions
          like "What is the refund policy?" in the chat.
        </p>
      )}
    </div>
  );
}
