/**
 * DocumentList.js — List of successfully indexed documents
 *
 * Features:
 * - Animated entry for each document card
 * - File type icon + colored accent
 * - File name, size, chunk count
 * - "Ready" status badge
 * - Delete button with confirmation
 * - Empty state illustration
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, FileType, File, Trash2, CheckCircle2, Layers } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────
function formatBytes(bytes = 0) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const FILE_CONFIG = {
  pdf:  { icon: FileText,  bg: 'bg-red-50   dark:bg-red-950/30',   iconColor: 'text-red-500',   dot: 'bg-red-400'   },
  docx: { icon: FileType,  bg: 'bg-blue-50  dark:bg-blue-950/30',  iconColor: 'text-blue-500',  dot: 'bg-blue-400'  },
  txt:  { icon: File,      bg: 'bg-slate-50 dark:bg-slate-800/40', iconColor: 'text-slate-500', dot: 'bg-slate-400' },
};

function getConfig(filename = '') {
  const ext = filename.split('.').pop().toLowerCase();
  return FILE_CONFIG[ext] || FILE_CONFIG.txt;
}

// ── Individual document card ───────────────────────────────
function DocCard({ doc, onDelete }) {
  const cfg   = getConfig(doc.filename);
  const Icon  = cfg.icon;

  const shortName = doc.filename.length > 26
    ? doc.filename.slice(0, 23) + '…'
    : doc.filename;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, x: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      className="group relative flex items-start gap-3 p-3 rounded-xl bg-white/60 dark:bg-gray-800/50 border border-slate-100 dark:border-gray-700/60 hover:border-indigo-200 dark:hover:border-indigo-800/60 hover:shadow-md transition-all duration-200"
    >
      {/* File type icon */}
      <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${cfg.bg} flex items-center justify-center`}>
        <Icon className={`w-4.5 h-4.5 ${cfg.iconColor}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate"
          title={doc.filename}
        >
          {shortName}
        </p>

        <div className="flex items-center gap-2 mt-1">
          {/* File size */}
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {formatBytes(doc.size)}
          </span>

          <span className="text-slate-200 dark:text-slate-700">·</span>

          {/* Chunk count */}
          <div className="flex items-center gap-1">
            <Layers className="w-3 h-3 text-slate-400" />
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {doc.chunks_stored} chunks
            </span>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1 mt-1.5">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Indexed & ready
          </span>
        </div>
      </div>

      {/* Delete button — appears on hover */}
      <motion.button
        initial={{ opacity: 0 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => onDelete(doc.doc_id)}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-150"
        aria-label="Remove document"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </motion.button>
    </motion.div>
  );
}

// ── Empty state ────────────────────────────────────────────
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-6 gap-2 text-center"
    >
      {/* Floating icon illustration */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/30 flex items-center justify-center"
      >
        <FileText className="w-6 h-6 text-indigo-300 dark:text-indigo-600" />
      </motion.div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-500">
        No documents yet
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-600 max-w-[160px]">
        Upload a PDF to start asking questions
      </p>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────
export default function DocumentList({ docs = [], onDelete }) {
  return (
    <div className="glass dark:glass rounded-2xl p-4 flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          Indexed Documents
        </h2>
        {docs.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-medium">
            {docs.length}
          </span>
        )}
      </div>

      {/* Document list — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <AnimatePresence mode="popLayout">
          {docs.length === 0 ? (
            <EmptyState key="empty" />
          ) : (
            <div className="flex flex-col gap-2">
              {docs.map((doc) => (
                <DocCard
                  key={doc.doc_id}
                  doc={doc}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
