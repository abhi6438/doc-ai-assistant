/**
 * ChatMessage.js — Individual message bubble
 *
 * Variants:
 *   user      → right-aligned, gradient blue bubble
 *   assistant → left-aligned, glass card, Markdown rendered
 *   typing    → AI typing indicator (3 bouncing dots)
 *
 * Features:
 * - Framer Motion slide-in animation
 * - Copy-to-clipboard on hover (AI messages)
 * - Collapsible "Source excerpts" panel
 * - Timestamp
 * - Markdown via react-markdown + remark-gfm
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Copy, Check, ChevronDown, BookOpen } from 'lucide-react';

// ── Typing dots ────────────────────────────────────────────
export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{    opacity: 0, y: 4 }}
      className="flex items-end gap-2"
    >
      {/* AI avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
        <Bot className="w-4 h-4 text-white" />
      </div>

      {/* Bubble */}
      <div className="glass dark:glass rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1.5">
        <span className="typing-dot bg-slate-400 dark:bg-slate-500" />
        <span className="typing-dot bg-slate-400 dark:bg-slate-500" />
        <span className="typing-dot bg-slate-400 dark:bg-slate-500" />
      </div>
    </motion.div>
  );
}

// ── Source excerpts panel ──────────────────────────────────
function SourcePanel({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2.5 border-t border-slate-100 dark:border-gray-700/60 pt-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
      >
        <BookOpen className="w-3 h-3" />
        <span>{sources.length} source excerpt{sources.length !== 1 ? 's' : ''}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{    opacity: 0, height: 0      }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 mt-2">
              {sources.map((src, i) => (
                <div
                  key={i}
                  className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-gray-900/60 border border-slate-100 dark:border-gray-700/50 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap"
                >
                  <span className="text-indigo-400 font-medium mr-1.5">#{i + 1}</span>
                  {src}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Copy button ────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <motion.button
      initial={{ opacity: 0 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={handleCopy}
      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all"
      aria-label="Copy response"
    >
      {copied
        ? <Check className="w-3 h-3 text-emerald-500" />
        : <Copy className="w-3 h-3" />
      }
    </motion.button>
  );
}

// ── Format timestamp ───────────────────────────────────────
function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Main ChatMessage component ─────────────────────────────
export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: -8, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-md">
        {isUser ? (
          <div className="w-full h-full rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
        ) : (
          <div className="w-full h-full rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-indigo-500/20">
            <Bot className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Bubble + metadata — wider on mobile */}
      <div className={`group flex flex-col gap-1 max-w-[88%] sm:max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>

        {/* Message bubble */}
        {isUser ? (
          /* ── User bubble ── */
          <div className="relative px-4 py-2.5 rounded-2xl rounded-br-sm bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-white text-sm leading-relaxed shadow-lg shadow-indigo-500/20">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        ) : (
          /* ── AI bubble ── */
          <div className="relative glass dark:glass rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-sm leading-relaxed">
            {/* Copy button */}
            <div className="absolute top-2 right-2">
              <CopyButton text={message.content} />
            </div>

            {/* AI badge */}
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse" />
              <span className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">
                AI · Document Analysis
              </span>
            </div>

            {/* Markdown content */}
            <div className="ai-prose text-slate-700 dark:text-slate-200 pr-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>

            {/* Error notice */}
            {message.error && (
              <p className="mt-2 text-xs text-red-400 italic">{message.error}</p>
            )}

            {/* Source excerpts */}
            {message.sources && <SourcePanel sources={message.sources} />}
          </div>
        )}

        {/* Timestamp */}
        {message.timestamp && (
          <span className="text-[10px] text-slate-300 dark:text-slate-600 px-1">
            {formatTime(message.timestamp)}
          </span>
        )}
      </div>
    </motion.div>
  );
}
