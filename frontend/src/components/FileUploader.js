/**
 * FileUploader.js — Drag-and-drop PDF/DOCX/TXT upload component
 *
 * Features:
 * - Animated drop zone with glow on drag-over
 * - File type icons and color coding
 * - Simulated progress bar + real axios onUploadProgress
 * - Scanning animation while "Analyzing document…"
 * - Multi-step status: uploading → analyzing → ready
 */

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  CloudUpload,
  FileText,
  FileType,
  File,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || '';

// ── File type config ───────────────────────────────────────
const FILE_TYPES = {
  pdf:  { icon: FileText,  color: 'text-red-500',   bg: 'bg-red-50  dark:bg-red-950/30',   border: 'border-red-200 dark:border-red-800/50'  },
  docx: { icon: FileType,  color: 'text-blue-500',  bg: 'bg-blue-50 dark:bg-blue-950/30',  border: 'border-blue-200 dark:border-blue-800/50' },
  txt:  { icon: File,      color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800/30', border: 'border-slate-200 dark:border-slate-700'  },
};

function getFileType(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  return FILE_TYPES[ext] || FILE_TYPES.txt;
}

// ── Scanning animation overlay ─────────────────────────────
function ScanOverlay() {
  return (
    <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
      <div className="scan-line" />
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent" />
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────
function ProgressBar({ progress, status }) {
  const colors = {
    uploading:  'progress-shimmer',
    analyzing:  'progress-shimmer',
    ready:      'bg-emerald-500',
    error:      'bg-red-500',
  };

  return (
    <div className="mt-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
          {status === 'uploading'  && 'Uploading…'}
          {status === 'analyzing' && 'Analyzing document…'}
          {status === 'ready'     && 'Ready!'}
          {status === 'error'     && 'Upload failed'}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {status !== 'error' ? `${Math.round(progress)}%` : ''}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className={`h-full rounded-full ${colors[status] || 'bg-indigo-500'}`}
        />
      </div>
    </div>
  );
}

export default function FileUploader({ onDocumentUploaded, compact = false }) {
  const [uploadState, setUploadState] = useState('idle'); // idle | uploading | analyzing | ready | error
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastFile, setLastFile] = useState(null);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'docx', 'txt'].includes(ext)) {
      setUploadState('error');
      setErrorMsg('Unsupported file type. Please upload PDF, DOCX, or TXT.');
      return;
    }

    setLastFile(file);
    setUploadState('uploading');
    setProgress(0);
    setErrorMsg('');

    // Build form data
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Phase 1: upload (0 → 60%)
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
        onUploadProgress: (evt) => {
          if (evt.total) {
            // Map raw upload progress to 0–60%
            setProgress(Math.min((evt.loaded / evt.total) * 60, 60));
          }
        },
      });

      // Phase 2: analyzing (60 → 95%)
      setUploadState('analyzing');
      // Animate progress from 60 to 95 in small increments to simulate work
      let p = 60;
      const tick = setInterval(() => {
        p += 3;
        setProgress(p);
        if (p >= 95) clearInterval(tick);
      }, 80);

      // Small delay for UX so user sees "Analyzing…" state
      await new Promise((r) => setTimeout(r, 600));
      clearInterval(tick);
      setProgress(100);

      // Phase 3: ready
      setUploadState('ready');
      onDocumentUploaded({
        doc_id:        response.data.doc_id,
        filename:      response.data.filename,
        chunks_stored: response.data.chunks_stored,
        size:          file.size,
        uploadedAt:    new Date(),
      });

      // Reset back to idle after 2.5 s so user can upload another
      setTimeout(() => {
        setUploadState('idle');
        setProgress(0);
        setLastFile(null);
      }, 2500);

    } catch (err) {
      setUploadState('error');
      setErrorMsg(
        err.response?.data?.detail ||
        err.message ||
        'Upload failed. Is the backend running?'
      );
      setProgress(0);
    }
  }, [onDocumentUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxFiles: 1,
    disabled: uploadState === 'uploading' || uploadState === 'analyzing',
  });

  const isIdle     = uploadState === 'idle';
  const isLoading  = uploadState === 'uploading' || uploadState === 'analyzing';
  const isReady    = uploadState === 'ready';
  const isError    = uploadState === 'error';

  const fileType   = lastFile ? getFileType(lastFile.name) : null;

  return (
    <div className="glass dark:glass rounded-2xl p-4 flex flex-col gap-3">
      {!compact && (
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Upload Document
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-600">
            PDF · DOCX · TXT
          </span>
        </div>
      )}

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`
          relative group cursor-pointer rounded-xl border-2 border-dashed transition-all duration-300
          ${compact ? 'py-5' : 'py-8'}
          ${isDragActive
            ? 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/20 shadow-glow-sm'
            : isError
              ? 'border-red-300 dark:border-red-800/60 bg-red-50/40 dark:bg-red-950/10'
              : isReady
                ? 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/10'
                : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-slate-50/50 dark:bg-slate-800/20 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10'
          }
        `}
      >
        <input {...getInputProps()} />

        {/* Scanning overlay when analyzing */}
        {uploadState === 'analyzing' && <ScanOverlay />}

        <div className="flex flex-col items-center gap-2 text-center px-4">
          {/* Icon */}
          <AnimatePresence mode="wait">
            {isReady ? (
              <motion.div
                key="check"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center"
              >
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </motion.div>
            ) : isError ? (
              <motion.div
                key="error"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center"
              >
                <AlertCircle className="w-6 h-6 text-red-500" />
              </motion.div>
            ) : isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`w-12 h-12 rounded-2xl ${fileType?.bg || 'bg-indigo-50 dark:bg-indigo-950/30'} flex items-center justify-center`}
              >
                <Loader2 className={`w-6 h-6 ${fileType?.color || 'text-indigo-500'} animate-spin`} />
              </motion.div>
            ) : (
              <motion.div
                key="upload"
                animate={isDragActive ? { scale: 1.15, y: -4 } : { scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/30 flex items-center justify-center group-hover:shadow-glow-sm transition-shadow"
              >
                <CloudUpload className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Text */}
          <div>
            {isReady && (
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Document indexed successfully!
              </p>
            )}
            {isError && (
              <p className="text-sm font-semibold text-red-500">{errorMsg}</p>
            )}
            {isLoading && lastFile && (
              <>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                  {lastFile.name}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {uploadState === 'uploading' ? 'Uploading…' : 'Analyzing document…'}
                </p>
              </>
            )}
            {isIdle && (
              <>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {isDragActive
                    ? 'Release to upload'
                    : compact
                      ? 'Drop or click to upload'
                      : 'Drop your document here'}
                </p>
                {!compact && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    or{' '}
                    <span className="text-indigo-500 dark:text-indigo-400 font-medium">
                      click to browse
                    </span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar (shown during upload/analyzing/ready) */}
      {uploadState !== 'idle' && uploadState !== 'error' && (
        <ProgressBar progress={progress} status={uploadState} />
      )}

      {/* Error retry hint */}
      {isError && (
        <p className="text-xs text-slate-400 dark:text-slate-600 text-center">
          Click the upload zone to try again
        </p>
      )}
    </div>
  );
}
