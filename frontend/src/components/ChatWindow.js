/**
 * ChatWindow.js — Main chat area
 *
 * Manages:
 * - messages[] state (user + assistant)
 * - isLoading state (AI thinking)
 * - API call to POST /ask
 * - Auto-scroll to latest message
 * - Empty state illustration
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  Bot,
  Sparkles,
  MessageSquarePlus,
  Trash2,
} from 'lucide-react';
import ChatMessage, { TypingIndicator } from './ChatMessage';
import ChatInput from './ChatInput';

const API_URL = process.env.REACT_APP_API_URL || '';

// ── Empty state ────────────────────────────────────────────
function EmptyState({ hasDocuments }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full gap-6 px-6 text-center select-none"
    >
      {/* Animated robot illustration */}
      <div className="relative">
        {/* Glow ring */}
        <div className="absolute inset-0 rounded-full bg-indigo-400/20 blur-2xl scale-125" />

        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="relative w-24 h-24 rounded-3xl btn-gradient flex items-center justify-center shadow-2xl shadow-indigo-500/30"
        >
          <Bot className="w-12 h-12 text-white" />
        </motion.div>

        {/* Sparkle accents */}
        {[
          { top: '-8px', right: '-8px', delay: 0,   size: 'w-5 h-5' },
          { top: '10px', left: '-12px', delay: 0.5, size: 'w-3.5 h-3.5' },
          { bottom: '-6px', right: '4px', delay: 1, size: 'w-4 h-4' },
        ].map((pos, i) => (
          <motion.div
            key={i}
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
            transition={{ duration: 2, delay: pos.delay, repeat: Infinity }}
            className={`absolute ${pos.size} text-amber-400`}
            style={{ top: pos.top, right: pos.right, left: pos.left, bottom: pos.bottom }}
          >
            <Sparkles className="w-full h-full" />
          </motion.div>
        ))}
      </div>

      {/* Text */}
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          {hasDocuments ? 'Ready to answer!' : 'Welcome to Document AI'}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
          {hasDocuments
            ? 'Your document is indexed. Ask me anything — I\'ll find the answer from your document.'
            : 'Upload a PDF, DOCX, or TXT document on the left, then start asking questions in natural language.'
          }
        </p>
      </div>

      {/* Feature pills */}
      {!hasDocuments && (
        <div className="flex flex-wrap gap-2 justify-center">
          {[
            { icon: '📄', label: 'PDF support'         },
            { icon: '🔍', label: 'Semantic search'      },
            { icon: '🧠', label: 'GPT-4o powered'      },
            { icon: '⚡', label: 'Instant answers'      },
          ].map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100/80 dark:bg-gray-800/60 border border-slate-200/80 dark:border-gray-700/60 text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              <span>{f.icon}</span>
              {f.label}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────
export default function ChatWindow({ hasDocuments }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to the latest message
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // ── Send question ────────────────────────────────────────
  const handleSend = async (question) => {
    if (!question || isLoading) return;

    const userMsg = {
      id:        `user-${Date.now()}`,
      role:      'user',
      content:   question,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const { data } = await axios.post(
        `${API_URL}/ask`,
        { question },
        { timeout: 60_000 }
      );

      const aiMsg = {
        id:        `ai-${Date.now()}`,
        role:      'assistant',
        content:   data.answer,
        sources:   data.sources || [],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const detail =
        err.response?.data?.detail ||
        err.message ||
        'Something went wrong. Please try again.';

      const errMsg = {
        id:        `err-${Date.now()}`,
        role:      'assistant',
        content:   'I encountered an error while generating your answer.',
        error:     detail,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Clear chat ───────────────────────────────────────────
  const clearChat = () => {
    setMessages([]);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full glass dark:glass rounded-2xl overflow-hidden">

      {/* ── Chat header ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2.5 md:px-4 md:py-3 border-b border-slate-100/80 dark:border-gray-800/80">
        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <div className="relative w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-emerald-500" />
            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
          </div>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            AI Chat
          </span>
          {hasDocuments && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 font-medium">
              Ready
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Message count — hidden on very small screens */}
          {hasMessages && (
            <span className="hidden sm:block text-xs text-slate-400 dark:text-slate-600 mr-1">
              {messages.length} msg{messages.length !== 1 ? 's' : ''}
            </span>
          )}

          {/* Clear button */}
          {hasMessages && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={clearChat}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 active:bg-red-50 dark:active:bg-red-950/30 transition-all"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">Clear</span>
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={clearChat}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all"
          >
            <MessageSquarePlus className="w-3 h-3" />
            New
          </motion.button>
        </div>
      </div>

      {/* ── Message list ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 md:px-4 md:py-4">
        {!hasMessages ? (
          <EmptyState hasDocuments={hasDocuments} />
        ) : (
          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <TypingIndicator key="typing" />
              )}
            </AnimatePresence>

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Chat input ── */}
      <ChatInput
        onSend={handleSend}
        disabled={!hasDocuments}
        isLoading={isLoading}
      />
    </div>
  );
}
