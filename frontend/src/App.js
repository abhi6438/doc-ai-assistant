/**
 * App.js — Root component
 *
 * State managed here:
 *  - authToken / authEmail  → email-verified session (checked on mount)
 *  - darkMode               → persisted in localStorage
 *  - uploadedDocs           → shared between sidebar + chat
 *  - mobileTab              → 'upload' | 'chat'
 *  - activePanel            → 'stats' | null  (modal panels)
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, MessageSquare } from 'lucide-react';
import axios from 'axios';
import Navbar from './components/Navbar';
import FileUploader from './components/FileUploader';
import DocumentList from './components/DocumentList';
import ChatWindow from './components/ChatWindow';
import StatsPanel from './components/StatsPanel';
import AuthGate from './components/AuthGate';

const API_URL = process.env.REACT_APP_API_URL || '';

export default function App() {
  // ── Auth ───────────────────────────────────────────────────
  const [authToken, setAuthToken] = useState(null);   // null = not checked yet
  const [authEmail, setAuthEmail] = useState('');
  const [authChecked, setAuthChecked] = useState(false);

  // On mount: restore token from localStorage and verify with backend
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const email = localStorage.getItem('auth_email');
    if (!token) {
      setAuthChecked(true);
      return;
    }
    axios.get(`${API_URL}/auth/me`, { headers: { 'X-Auth-Token': token } })
      .then(() => {
        setAuthToken(token);
        setAuthEmail(email || '');
        // Set default header for all subsequent axios requests
        axios.defaults.headers.common['X-Auth-Token'] = token;
      })
      .catch(() => {
        // Token expired or invalid — clear it
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_email');
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const handleAuthenticated = (token, email) => {
    setAuthToken(token);
    setAuthEmail(email);
    // All future axios requests will carry the auth token automatically
    axios.defaults.headers.common['X-Auth-Token'] = token;
  };

  // ── Dark mode ─────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return JSON.parse(saved);
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // ── Documents ──────────────────────────────────────────────
  const [uploadedDocs, setUploadedDocs] = useState([]);

  const handleDocumentUploaded = (docInfo) => {
    setUploadedDocs((prev) => [...prev, docInfo]);
    setMobileTab('chat');
  };

  const handleDocumentDeleted = (docId) => {
    setUploadedDocs((prev) => prev.filter((d) => d.doc_id !== docId));
  };

  // ── Mobile tab ─────────────────────────────────────────────
  const [mobileTab, setMobileTab] = useState('chat');

  // ── Modal panels ───────────────────────────────────────────
  const [activePanel, setActivePanel] = useState(null);

  const handleNavAction = (action) => {
    switch (action) {
      case 'settings':
      case 'stats':
        setActivePanel('stats');
        break;
      case 'upload':
        setMobileTab('upload');
        break;
      case 'chat':
        setMobileTab('chat');
        break;
      default:
        break;
    }
  };

  // ── Splash while checking saved token ─────────────────────
  if (!authChecked) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="fixed inset-0 page-bg bg-slate-50 dark:bg-gray-950 flex items-center justify-center">
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-12 h-12 rounded-2xl btn-gradient flex items-center justify-center shadow-xl"
          >
            <span className="text-white text-xl font-bold">AI</span>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Auth gate ─────────────────────────────────────────────
  if (!authToken) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <AuthGate onAuthenticated={handleAuthenticated} />
      </div>
    );
  }

  // ── Main app ──────────────────────────────────────────────
  return (
    <div className={darkMode ? 'dark' : ''}>

      {/* Background */}
      <div className="fixed inset-0 page-bg bg-slate-50 dark:bg-gray-950 -z-10" />

      {/* Full viewport */}
      <div className="flex flex-col h-[100dvh] overflow-hidden">

        {/* Navbar */}
        <Navbar
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
          onNavAction={handleNavAction}
          userEmail={authEmail}
        />

        {/* ── Desktop (md+): sidebar + chat ── */}
        <main className="hidden md:flex flex-1 overflow-hidden gap-4 p-4 lg:gap-5 lg:p-5">
          <aside className="flex flex-col gap-4 w-80 xl:w-96 flex-shrink-0">
            <FileUploader onDocumentUploaded={handleDocumentUploaded} />
            <DocumentList docs={uploadedDocs} onDelete={handleDocumentDeleted} />
          </aside>
          <section className="flex-1 min-w-0">
            <ChatWindow hasDocuments={uploadedDocs.length > 0} />
          </section>
        </main>

        {/* ── Mobile: tab panels ── */}
        <div className="md:hidden flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden relative">
            <AnimatePresence mode="wait" initial={false}>
              {mobileTab === 'upload' ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0  }}
                  exit={{    opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 overflow-y-auto p-3 flex flex-col gap-3"
                >
                  <FileUploader onDocumentUploaded={handleDocumentUploaded} />
                  <DocumentList docs={uploadedDocs} onDelete={handleDocumentDeleted} />
                </motion.div>
              ) : (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{    opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 p-3 flex flex-col"
                >
                  <ChatWindow hasDocuments={uploadedDocs.length > 0} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom tab bar */}
          <div
            className="flex-shrink-0 flex border-t border-slate-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {[
              { id: 'upload', label: 'Documents', icon: Upload,        badge: uploadedDocs.length || null },
              { id: 'chat',   label: 'Chat',       icon: MessageSquare, badge: null },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMobileTab(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors relative
                  ${mobileTab === tab.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}
              >
                {mobileTab === tab.id && (
                  <motion.div layoutId="tab-indicator"
                    className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600" />
                )}
                <div className="relative">
                  <tab.icon className="w-5 h-5" />
                  {tab.badge && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {activePanel === 'stats' && (
          <StatsPanel onClose={() => setActivePanel(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
