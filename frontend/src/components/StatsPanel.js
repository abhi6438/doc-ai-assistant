/**
 * StatsPanel.js — Admin Analytics Dashboard
 *
 * Features:
 * - Password-protected (uses ADMIN_KEY from backend)
 * - Summary cards: uploads, questions, unique users
 * - 7-day activity bar chart (pure CSS, no chart library)
 * - Recent activity feed (uploads + questions)
 * - Top questions list
 * - Auto-refreshes every 30 seconds when open
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  X, RefreshCw, Upload, MessageSquare, Users,
  TrendingUp, Key, BarChart2, Activity,
  FileText, HelpCircle, Lock,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || '';

// ── Stat card ─────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className={`rounded-2xl p-4 border ${color}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-widest opacity-70">{label}</span>
        <Icon className="w-4 h-4 opacity-60" />
      </div>
      <div className="text-2xl font-bold">{value ?? '—'}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Mini bar chart (last 7 days) ──────────────────────────
function DailyChart({ data }) {
  if (!data?.length) return null;
  const maxVal = Math.max(...data.map(d => d.uploads + d.questions), 1);

  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
        Last 7 Days Activity
      </h3>
      <div className="flex items-end gap-1.5 h-20">
        {data.map((d) => {
          const total = d.uploads + d.questions;
          const pct   = (total / maxVal) * 100;
          const uPct  = total > 0 ? (d.uploads  / total) * pct : 0;
          const qPct  = total > 0 ? (d.questions / total) * pct : 0;
          const label = d.date.slice(5); // MM-DD

          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.uploads} uploads, ${d.questions} questions`}>
              <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: 56 }}>
                {total === 0 ? (
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded" style={{ height: '100%' }} />
                ) : (
                  <>
                    <div className="w-full bg-indigo-400 dark:bg-indigo-500 transition-all" style={{ height: `${qPct}%` }} />
                    <div className="w-full bg-emerald-400 dark:bg-emerald-500 transition-all" style={{ height: `${uPct}%` }} />
                  </>
                )}
              </div>
              <span className="text-[9px] text-slate-400 dark:text-slate-600">{label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-2">
        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" /> Uploads</span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-indigo-400 inline-block" /> Questions</span>
      </div>
    </div>
  );
}

// ── Activity feed item ────────────────────────────────────
function FeedItem({ item }) {
  const isUpload = item.type === 'upload';
  const time = new Date(item.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-slate-100 dark:border-gray-800 last:border-0">
      <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center
        ${isUpload ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-indigo-50 dark:bg-indigo-950/30'}`}>
        {isUpload
          ? <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          : <HelpCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-700 dark:text-slate-300 truncate font-medium">{item.label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-slate-400">{item.detail}</span>
          <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
          <span className="text-[10px] text-slate-400">{time}</span>
          <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
          <span className="text-[10px] text-slate-400 font-mono">{item.ip}</span>
        </div>
      </div>
    </div>
  );
}

// ── Login form ────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError('');
    try {
      await axios.get(`${API_URL}/admin/stats?key=${encodeURIComponent(key)}`);
      onLogin(key);
    } catch {
      setError('Invalid admin key. Check your ADMIN_KEY in backend/.env');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/30">
        <Lock className="w-7 h-7 text-white" />
      </div>
      <div>
        <h3 className="text-base font-bold text-slate-800 dark:text-white">Admin Analytics</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Enter your admin key to view stats</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
        <div className="relative">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter admin key…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-indigo-400 transition-colors"
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="submit"
          disabled={loading || !key.trim()}
          className="py-2.5 rounded-xl btn-gradient text-white text-sm font-semibold disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Access Analytics'}
        </motion.button>
      </form>

      <p className="text-[11px] text-slate-400 dark:text-slate-600">
        Default key: <span className="font-mono">admin123</span><br />
        Change it in <span className="font-mono">backend/.env</span> → <span className="font-mono">ADMIN_KEY=…</span>
      </p>
    </div>
  );
}

// ── Main StatsPanel ───────────────────────────────────────
export default function StatsPanel({ onClose }) {
  const [adminKey, setAdminKey]     = useState(() => sessionStorage.getItem('adminKey') || '');
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchStats = useCallback(async (key) => {
    if (!key) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/admin/stats?key=${encodeURIComponent(key)}`);
      setStats(data);
      setLastRefresh(new Date());
    } catch {
      setAdminKey('');
      sessionStorage.removeItem('adminKey');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load if key already in session
  useEffect(() => {
    if (adminKey) fetchStats(adminKey);
  }, [adminKey, fetchStats]);

  // Auto-refresh every 30 s
  useEffect(() => {
    if (!adminKey) return;
    const id = setInterval(() => fetchStats(adminKey), 30_000);
    return () => clearInterval(id);
  }, [adminKey, fetchStats]);

  const handleLogin = (key) => {
    sessionStorage.setItem('adminKey', key);
    setAdminKey(key);
  };

  const s = stats?.summary;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1,    y: 0  }}
        exit={{    scale: 0.95, y: 20 }}
        className="w-full max-w-2xl max-h-[90vh] glass dark:glass rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl btn-gradient flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">Analytics Dashboard</h2>
              {lastRefresh && (
                <p className="text-[10px] text-slate-400">
                  Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {adminKey && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => fetchStats(adminKey)}
                disabled={loading}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!adminKey ? (
            <AdminLogin onLogin={handleLogin} />
          ) : loading && !stats ? (
            <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading analytics…</span>
            </div>
          ) : stats ? (
            <div className="p-5 flex flex-col gap-5">

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  icon={Upload} label="Uploads" value={s.total_uploads}
                  sub={`${s.uploads_last_24h} today`}
                  color="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300"
                />
                <StatCard
                  icon={MessageSquare} label="Questions" value={s.total_questions}
                  sub={`${s.questions_last_24h} today`}
                  color="bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200/60 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300"
                />
                <StatCard
                  icon={Users} label="Unique Users" value={s.unique_users_all}
                  sub={`${s.unique_users_7d} this week`}
                  color="bg-blue-50 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-800/40 text-blue-700 dark:text-blue-300"
                />
                <StatCard
                  icon={TrendingUp} label="7-Day Q&A" value={s.questions_last_7d}
                  sub={`${s.uploads_last_7d} uploads`}
                  color="bg-purple-50 dark:bg-purple-950/20 border-purple-200/60 dark:border-purple-800/40 text-purple-700 dark:text-purple-300"
                />
              </div>

              {/* 7-day chart */}
              <div className="glass dark:glass rounded-2xl p-4">
                <DailyChart data={stats.daily_chart} />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* Recent activity */}
                <div className="glass dark:glass rounded-2xl p-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
                    <Activity className="w-3.5 h-3.5" /> Recent Activity
                  </h3>
                  <div className="max-h-52 overflow-y-auto">
                    {stats.recent_activity.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">No activity yet</p>
                    ) : (
                      stats.recent_activity.map((item, i) => (
                        <FeedItem key={i} item={item} />
                      ))
                    )}
                  </div>
                </div>

                {/* Top questions */}
                <div className="glass dark:glass rounded-2xl p-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
                    <HelpCircle className="w-3.5 h-3.5" /> Top Questions
                  </h3>
                  <div className="max-h-52 overflow-y-auto flex flex-col gap-1.5">
                    {stats.top_questions.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">No questions yet</p>
                    ) : (
                      stats.top_questions.map((q, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-slate-100 dark:border-gray-800 last:border-0">
                          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[9px] font-bold">{i + 1}</span>
                          <span className="text-slate-600 dark:text-slate-400 leading-relaxed">{q}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Registered users */}
              <div className="glass dark:glass rounded-2xl p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
                  <Users className="w-3.5 h-3.5" /> Registered Users ({stats.registered_users?.length ?? 0})
                </h3>
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                  {!stats.registered_users?.length ? (
                    <p className="text-xs text-slate-400 text-center py-4">No verified users yet</p>
                  ) : (
                    stats.registered_users.map((u, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-gray-800 last:border-0">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                            {u.email?.[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate max-w-[180px]">{u.email}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">
                          {new Date(u.verified_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* API access hint */}
              <div className="rounded-xl bg-slate-50 dark:bg-gray-800/50 border border-slate-200 dark:border-gray-700 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold">Direct API access:</span>{' '}
                  <span className="font-mono text-indigo-500">
                    GET /admin/stats?key={adminKey.slice(0, 4)}****
                  </span>
                  {' '}— use this to build your own dashboards or set up alerts.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
