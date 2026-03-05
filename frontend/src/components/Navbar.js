/**
 * Navbar.js — Top navigation bar
 * All menu items wired to real actions via onNavAction callback.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Sun, Moon, Bell, Settings,
  Upload, MessageSquare, BarChart2, Sparkles, ChevronDown,
  LogOut, Key, User,
} from 'lucide-react';

const navLinks = [
  { id: 'chat',     label: 'Chat',      icon: MessageSquare, active: true  },
  { id: 'upload',   label: 'Upload',    icon: Upload,        active: false },
  { id: 'stats',    label: 'Analytics', icon: BarChart2,     active: false },
  { id: 'settings', label: 'Settings',  icon: Settings,      active: false },
];

export default function Navbar({ darkMode, onToggleDark, onNavAction, userEmail }) {
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleAction = (action) => {
    setShowUserMenu(false);
    if (action === 'signout') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_email');
      window.location.reload();
      return;
    }
    onNavAction?.(action);
  };

  return (
    <header className="relative z-50 flex-shrink-0 px-3 py-2 md:px-4 md:py-2.5 lg:px-6">
      <nav className="glass dark:glass rounded-2xl flex items-center px-3 py-2 md:px-4 md:py-2.5 shadow-sm gap-2">

        {/* ── Brand ── */}
        <div className="flex items-center gap-2 mr-2 md:mr-4">
          <motion.div
            whileHover={{ rotate: [0, -10, 10, 0], scale: 1.05 }}
            transition={{ duration: 0.4 }}
            className="w-8 h-8 md:w-9 md:h-9 rounded-xl btn-gradient flex items-center justify-center shadow-md shadow-indigo-500/30 flex-shrink-0"
          >
            <Bot className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </motion.div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">
                Document AI
              </span>
              <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-md bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium leading-none">
                PRO
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-slate-400 dark:text-slate-500 leading-none">
              Powered by RAG + Groq
            </p>
          </div>
        </div>

        {/* ── Desktop nav links ── */}
        <div className="hidden lg:flex items-center gap-0.5 flex-1">
          {navLinks.map((link) => (
            <motion.button
              key={link.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAction(link.id)}
              className={`
                flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all
                ${link.active
                  ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
                }
              `}
            >
              <link.icon className="w-3.5 h-3.5" />
              {link.label}
              {link.active && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 ml-0.5" />}
            </motion.button>
          ))}
        </div>

        {/* ── Right actions ── */}
        <div className="flex items-center gap-1 ml-auto">

          {/* Groq badge — opens analytics on click */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handleAction('stats')}
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/60 dark:border-amber-800/40 hover:border-amber-300 dark:hover:border-amber-700 transition-colors cursor-pointer"
            title="View Analytics"
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Groq</span>
          </motion.button>

          {/* Analytics / notifications bell */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleAction('stats')}
            className="hidden sm:flex relative w-8 h-8 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Analytics"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          </motion.button>

          {/* Dark mode toggle */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onToggleDark}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle theme"
          >
            <AnimatePresence mode="wait" initial={false}>
              {darkMode ? (
                <motion.span key="sun"
                  initial={{ opacity: 0, rotate: -90, scale: 0.7 }}
                  animate={{ opacity: 1, rotate: 0,   scale: 1   }}
                  exit={{    opacity: 0, rotate:  90, scale: 0.7 }}
                  transition={{ duration: 0.2 }}
                >
                  <Sun className="w-4 h-4 text-amber-400" />
                </motion.span>
              ) : (
                <motion.span key="moon"
                  initial={{ opacity: 0, rotate: 90,  scale: 0.7 }}
                  animate={{ opacity: 1, rotate: 0,   scale: 1   }}
                  exit={{    opacity: 0, rotate: -90, scale: 0.7 }}
                  transition={{ duration: 0.2 }}
                >
                  <Moon className="w-4 h-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          {/* Divider */}
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* User avatar + dropdown */}
          <div className="relative">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="relative">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                  {(userEmail?.[0] || 'U').toUpperCase()}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border-2 border-white dark:border-gray-900" />
              </div>
              <ChevronDown className={`hidden sm:block w-3 h-3 text-slate-400 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
            </motion.button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0,  scale: 1    }}
                  exit={{    opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-48 glass dark:glass rounded-xl overflow-hidden shadow-xl z-50"
                >
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-700">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {userEmail || 'User'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">{userEmail || ''}</p>
                  </div>

                  {[
                    { label: 'Profile',    icon: User,     action: null,      hint: 'Soon' },
                    { label: 'Analytics',  icon: BarChart2,action: 'stats',   hint: null },
                    { label: 'API Keys',   icon: Key,      action: null,      hint: 'Soon' },
                    { label: 'Sign out',   icon: LogOut,   action: 'signout', hint: null,  danger: true },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => item.action ? handleAction(item.action) : setShowUserMenu(false)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs transition-colors text-left
                        ${item.danger
                          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                        }`}
                    >
                      <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.hint && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                          {item.hint}
                        </span>
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>
    </header>
  );
}
