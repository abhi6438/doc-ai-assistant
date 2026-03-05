/**
 * Chat.js — Conversational Q&A interface
 *
 * Features:
 * - Displays conversation history (user + assistant messages)
 * - Animated "thinking" indicator while the API is responding
 * - Collapsible source excerpts shown under each AI answer
 * - Shift+Enter for newline, Enter to send
 * - Auto-scrolls to the latest message
 * - Disabled with hint when no document has been uploaded yet
 */

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";

const API_URL = process.env.REACT_APP_API_URL || "";

// ── Utility: auto-resize textarea ──────────────────────────
function autoResize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

// ── Source excerpts sub-component ──────────────────────────
function SourceList({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="sources">
      <button
        className="sources-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} {sources.length} source excerpt
        {sources.length !== 1 ? "s" : ""}
      </button>

      {open && (
        <div className="sources-list">
          {sources.map((src, i) => (
            <div key={i} className="source-item">
              {src}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single message bubble ───────────────────────────────────
function Message({ msg }) {
  const isUser = msg.role === "user";

  return (
    <div className={`message ${msg.role}`}>
      {/* Avatar */}
      <div className="avatar">{isUser ? "👤" : "🤖"}</div>

      {/* Bubble */}
      <div className="bubble">
        {msg.thinking ? (
          // Animated dots while waiting for API response
          <div className="thinking">
            <span /><span /><span />
          </div>
        ) : (
          <>
            {isUser ? (
              // User messages shown as plain text
              <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
            ) : (
              // AI responses rendered as Markdown
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            )}

            {/* Collapsible source references (only on assistant messages) */}
            {!isUser && msg.sources && (
              <SourceList sources={msg.sources} />
            )}

            {/* Error badge */}
            {msg.error && (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "var(--error)",
                  fontStyle: "italic",
                }}
              >
                {msg.error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Chat component ─────────────────────────────────────
export default function Chat({ hasDocuments }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send question to backend ──────────────────────────────
  const sendQuestion = async () => {
    const question = input.trim();
    if (!question || loading) return;

    // Add user message to conversation
    const userMsg = { role: "user", content: question, id: Date.now() };
    // Add a placeholder "thinking" bubble for the assistant
    const thinkingMsg = {
      role: "assistant",
      content: "",
      thinking: true,
      id: Date.now() + 1,
    };

    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setInput("");
    setLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      // POST /ask — backend returns { answer, sources, backend }
      const response = await axios.post(
        `${API_URL}/ask`,
        { question },
        { timeout: 60_000 }
      );

      const { answer, sources } = response.data;

      // Replace the thinking bubble with the real answer
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingMsg.id
            ? { ...m, thinking: false, content: answer, sources }
            : m
        )
      );
    } catch (err) {
      const detail =
        err.response?.data?.detail ||
        err.message ||
        "An unexpected error occurred.";

      // Replace thinking bubble with error message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingMsg.id
            ? {
                ...m,
                thinking: false,
                content: "Sorry, I encountered an error.",
                error: detail,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Keyboard handler ─────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();  // prevent newline
      sendQuestion();
    }
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="chat-container">
      {/* Message list */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="empty-icon">💬</div>
            <p>
              {hasDocuments
                ? "Ask a question about your document."
                : "Upload a PDF to get started."}
            </p>
            {hasDocuments && (
              <span>e.g. "What is the refund policy?"</span>
            )}
          </div>
        ) : (
          messages.map((msg) => <Message key={msg.id} msg={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={
              hasDocuments
                ? "Ask a question about your document…"
                : "Upload a document first to enable chat"
            }
            value={input}
            rows={1}
            disabled={!hasDocuments || loading}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={handleKeyDown}
          />

          <button
            className="send-btn"
            onClick={sendQuestion}
            disabled={!hasDocuments || loading || !input.trim()}
            aria-label="Send"
          >
            {loading ? (
              <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
            ) : (
              "➤"
            )}
          </button>
        </div>

        <p className="chat-hint">
          Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for a new line
        </p>
      </div>
    </div>
  );
}
