/**
 * ChatInput.js — Mobile-first smart chat input bar
 *
 * Mobile improvements:
 * - Larger tap targets (min 44px send button)
 * - Suggestion chips hidden when input has text (saves space)
 * - No keyboard hint on mobile (irrelevant for touch)
 * - Safe-area padding for devices with home indicator
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Lock } from 'lucide-react';

const SUGGESTIONS = [
  { text: 'Summarize this document',        emoji: '📋' },
  { text: 'What are the key points?',       emoji: '🎯' },
  { text: 'Explain the important sections', emoji: '📖' },
  { text: 'What risks are mentioned?',      emoji: '⚠️' },
  { text: 'List all action items',          emoji: '✅' },
  { text: 'What are the main conclusions?', emoji: '💡' },
  { text: 'Who are the key stakeholders?',  emoji: '👥' },
];

export default function ChatInput({ onSend, disabled, isLoading }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  const resize = useCallback((el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, []);

  const handleChange = (e) => {
    setInput(e.target.value);
    resize(e.target);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || disabled || isLoading) return;
    onSend(text);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const applySuggestion = (text) => {
    if (disabled || isLoading) return;
    setInput(text);
    textareaRef.current?.focus();
    setTimeout(() => resize(textareaRef.current), 0);
  };

  const canSend = input.trim().length > 0 && !disabled && !isLoading;
  const showChips = !disabled && input.trim().length === 0;

  return (
    <div className="flex-shrink-0 border-t border-slate-100/80 dark:border-gray-800/80 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-b-2xl"
         style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

      {/* ── Suggestion chips ── */}
      <AnimatePresence>
        {showChips && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 px-3 pt-3 pb-1 overflow-x-auto scrollbar-hide">
              {SUGGESTIONS.map((s) => (
                <motion.button
                  key={s.text}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => applySuggestion(s.text)}
                  disabled={isLoading}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium
                             bg-gradient-to-r from-slate-50 to-indigo-50/60 dark:from-gray-800 dark:to-indigo-950/30
                             text-slate-600 dark:text-slate-400
                             border border-slate-200/80 dark:border-gray-700/60
                             active:border-indigo-400 active:text-indigo-600
                             disabled:opacity-40 disabled:cursor-not-allowed
                             transition-colors whitespace-nowrap shadow-sm"
                >
                  <span>{s.emoji}</span>
                  {s.text}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input row ── */}
      <div className="flex items-end gap-2 p-3">

        {/* Textarea */}
        <div className={`flex-1 relative rounded-2xl transition-all duration-200
          ${disabled ? 'opacity-60' : 'focus-within:ring-2 focus-within:ring-indigo-400/40 dark:focus-within:ring-indigo-500/30'}`}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || isLoading}
            rows={1}
            placeholder={
              disabled
                ? 'Upload a document to start chatting…'
                : 'Ask anything about your document…'
            }
            className="
              w-full resize-none rounded-2xl
              bg-white dark:bg-gray-800
              border border-slate-200 dark:border-gray-700
              text-slate-800 dark:text-slate-100
              placeholder-slate-400 dark:placeholder-slate-600
              text-sm leading-relaxed
              px-4 py-3
              focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-600
              transition-colors duration-150
              disabled:cursor-not-allowed
            "
            style={{ minHeight: 48, maxHeight: 112 }}
          />
          {disabled && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Lock className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
            </div>
          )}
        </div>

        {/* Send button — min 44×44 for touch accessibility */}
        <motion.button
          whileTap={canSend ? { scale: 0.92 } : {}}
          onClick={handleSend}
          disabled={!canSend}
          className={`
            flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center
            transition-all duration-200
            ${canSend
              ? 'btn-gradient text-white shadow-lg active:shadow-md'
              : 'bg-slate-100 dark:bg-gray-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
            }
          `}
          aria-label="Send message"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </motion.button>
      </div>

      {/* ── Keyboard hint — desktop only ── */}
      <p className="hidden sm:block text-center text-[11px] text-slate-300 dark:text-slate-700 pb-2 select-none">
        {disabled ? (
          <span className="flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" />
            Upload a document to unlock chat
          </span>
        ) : (
          <>
            <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-gray-800 font-mono text-slate-400 dark:text-slate-600 text-[10px]">↵</kbd>
            {' '}send ·{' '}
            <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-gray-800 font-mono text-slate-400 dark:text-slate-600 text-[10px]">⇧↵</kbd>
            {' '}new line
          </>
        )}
      </p>
    </div>
  );
}
