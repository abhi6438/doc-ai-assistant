/**
 * AuthGate.js — Email OTP verification screen
 *
 * Shows before the main app. Steps:
 *  1. User enters their email
 *  2. Backend sends a 6-digit OTP (or logs it to console in dev mode)
 *  3. User types the code — auto-submits when all 6 digits filled
 *  4. On success: token stored in localStorage, onAuthenticated() called
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  Bot, Mail, ArrowRight, RefreshCw, CheckCircle, ShieldCheck,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || '';

export default function AuthGate({ onAuthenticated }) {
  const [step, setStep]       = useState('email'); // 'email' | 'otp' | 'success'
  const [email, setEmail]     = useState('');
  const [otp, setOtp]         = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]     = useState('');
  const [devMode, setDevMode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef([]);

  // Resend countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ── Step 1: send OTP ────────────────────────────────────────
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setError('');
    try {
      const { data } = await axios.post(`${API_URL}/auth/request-otp`, { email: trimmed });
      setDevMode(!!data.dev_mode);
      setStep('otp');
      setCountdown(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 120);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not send code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 2: verify OTP ──────────────────────────────────────
  const submitOtp = useCallback(async (code) => {
    setIsLoading(true);
    setError('');
    try {
      const { data } = await axios.post(`${API_URL}/auth/verify-otp`, {
        email: email.trim(),
        otp:   code,
      });
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_email', data.email);
      setStep('success');
      setTimeout(() => onAuthenticated(data.token, data.email), 1100);
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 60);
    } finally {
      setIsLoading(false);
    }
  }, [email, onAuthenticated]);

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (next.every((d) => d) && value) submitOtp(next.join(''));
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      submitOtp(pasted);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || isLoading) return;
    setOtp(['', '', '', '', '', '']);
    setError('');
    setIsLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/request-otp`, { email: email.trim() });
      setDevMode(!!data.dev_mode);
      setCountdown(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 60);
    } catch {
      setError('Failed to resend. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
         style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>

      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 rounded-full bg-purple-600/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm"
      >
        <div className="bg-white/[0.06] backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 shadow-2xl">

          {/* Logo */}
          <div className="flex flex-col items-center mb-7">
            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4"
            >
              <Bot className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Document AI</h1>
            <p className="text-slate-400 text-sm mt-1">
              {step === 'email'   ? 'Enter your email to get started'   :
               step === 'otp'    ? 'Check your inbox for a code'        :
                                   'Verifying your account...'}
            </p>
          </div>

          <AnimatePresence mode="wait">

            {/* ── Email step ── */}
            {step === 'email' && (
              <motion.form
                key="email"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0  }}
                exit={{    opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleEmailSubmit}
                className="flex flex-col gap-4"
              >
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    className="w-full bg-white/[0.06] border border-white/[0.10] rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 text-sm transition-all"
                  />
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                  >{error}</motion.p>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !email.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20"
                >
                  {isLoading
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <><span>Send verification code</span><ArrowRight className="w-4 h-4" /></>
                  }
                </button>

                <p className="text-center text-[11px] text-slate-500">
                  We'll send a 6-digit code to your inbox
                </p>
              </motion.form>
            )}

            {/* ── OTP step ── */}
            {step === 'otp' && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0  }}
                exit={{    opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-5"
              >
                {/* Email + change link */}
                <div className="text-center">
                  <p className="text-slate-300 text-sm">
                    Code sent to{' '}
                    <span className="text-white font-semibold">{email}</span>
                  </p>
                  <button
                    onClick={() => { setStep('email'); setError(''); setOtp(['','','','','','']); }}
                    className="text-indigo-400 text-xs hover:text-indigo-300 mt-0.5 transition-colors"
                  >
                    Change email
                  </button>
                </div>

                {/* Dev mode banner */}
                {devMode && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-center">
                    <p className="text-amber-300 text-xs font-medium">Dev mode — check server console for OTP</p>
                  </div>
                )}

                {/* 6-box OTP input */}
                <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      disabled={isLoading}
                      className="w-11 h-14 text-center text-xl font-bold bg-white/[0.06] border border-white/[0.10] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 disabled:opacity-40 transition-all caret-transparent"
                    />
                  ))}
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center"
                  >{error}</motion.p>
                )}

                {isLoading && (
                  <div className="flex justify-center">
                    <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                  </div>
                )}

                {/* Resend */}
                <p className="text-center text-xs text-slate-500">
                  Didn&apos;t receive it?{' '}
                  {countdown > 0
                    ? <span className="text-slate-400">Resend in {countdown}s</span>
                    : (
                      <button
                        onClick={handleResend}
                        disabled={isLoading}
                        className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                      >
                        Resend code
                      </button>
                    )
                  }
                </p>
              </motion.div>
            )}

            {/* ── Success step ── */}
            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1    }}
                className="flex flex-col items-center gap-4 py-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 14 }}
                  className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center"
                >
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </motion.div>
                <div className="text-center">
                  <p className="text-white font-bold text-lg">Verified!</p>
                  <p className="text-slate-400 text-sm mt-1">Launching your workspace…</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
          <p className="text-center text-xs text-slate-600">
            Secure one-time verification &nbsp;·&nbsp; Powered by RAG + Groq
          </p>
        </div>
      </motion.div>
    </div>
  );
}
