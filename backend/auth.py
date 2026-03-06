"""
auth.py — Email OTP authentication
-----------------------------------
Uses a Vercel relay function to send emails.
HuggingFace Spaces IPs are blocked by Cloudflare (used by Mailjet, Resend, etc.),
so the HF backend calls a Vercel serverless function which then calls Mailjet.

Required env vars on HF Space:
  EMAIL_RELAY_URL    = https://doc-ai-assistant.vercel.app/api/send-email
  EMAIL_RELAY_SECRET = (random shared secret — same value set on Vercel)

Required env vars on Vercel:
  MAILJET_API_KEY    = ...
  MAILJET_SECRET_KEY = ...
  EMAIL_FROM_ADDR    = 776438@gmail.com
  RELAY_SECRET       = (same random secret)
"""

import os
import json
import urllib.request
import urllib.error
import random
import string
import uuid
from datetime import datetime, timedelta
from typing import Optional

# ── Config ─────────────────────────────────────────────────────────────────
EMAIL_RELAY_URL    = os.getenv("EMAIL_RELAY_URL", "")
EMAIL_RELAY_SECRET = os.getenv("EMAIL_RELAY_SECRET", "")

OTP_EXPIRY_MINUTES   = 10
SESSION_EXPIRY_HOURS = 24

# ── In-memory stores ───────────────────────────────────────────────────────
_pending_otps: dict = {}
_sessions: dict     = {}


# ── Helpers ────────────────────────────────────────────────────────────────

def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def _otp_email_html(otp: str) -> str:
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;">
<div style="max-width:480px;margin:40px auto;padding:24px;">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:16px;padding:32px;text-align:center;margin-bottom:16px;">
    <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">Document AI Assistant</h1>
    <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Email verification</p>
  </div>
  <div style="background:white;border-radius:16px;padding:32px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <p style="color:#475569;font-size:15px;margin:0 0 24px;">Your one-time verification code:</p>
    <div style="font-size:44px;font-weight:800;letter-spacing:14px;color:#6366f1;background:#eef2ff;padding:20px 28px;border-radius:14px;display:inline-block;font-variant-numeric:tabular-nums;">{otp}</div>
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;">Expires in {OTP_EXPIRY_MINUTES} minutes &nbsp;&middot;&nbsp; Do not share this code</p>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
    If you didn&apos;t request this, you can safely ignore this email.
  </p>
</div></body></html>"""


def _send_via_relay(to_email: str, subject: str, html_body: str) -> None:
    """Send email via Vercel relay function (bypasses HF Spaces Cloudflare block)."""
    payload = json.dumps({
        "to":      to_email,
        "subject": subject,
        "html":    html_body,
    }).encode("utf-8")
    req = urllib.request.Request(
        EMAIL_RELAY_URL,
        data=payload,
        headers={
            "Content-Type":    "application/json",
            "X-Relay-Secret":  EMAIL_RELAY_SECRET,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status not in (200, 201):
                raise RuntimeError(f"Relay HTTP {resp.status}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"Relay error {e.code}: {body[:300]}")


# ── Public API ─────────────────────────────────────────────────────────────

def request_otp(email: str) -> bool:
    """
    Generate a 6-digit OTP and send it to the email.
    Returns True if sent, False in dev mode (OTP printed to server console).
    """
    email = email.strip().lower()
    otp   = _generate_otp()
    _pending_otps[email] = {
        "otp":        otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    }

    if EMAIL_RELAY_URL and EMAIL_RELAY_SECRET:
        _send_via_relay(email, "Your Document AI verification code", _otp_email_html(otp))
        return True

    # Dev mode — no relay configured
    print(f"\n{'='*52}")
    print(f"  [DEV MODE] OTP for {email}:  {otp}")
    print(f"  (set EMAIL_RELAY_URL + EMAIL_RELAY_SECRET in environment)")
    print(f"{'='*52}\n")
    return False


def verify_otp(email: str, otp: str) -> str:
    """Verify OTP, return session token. Raises ValueError on failure."""
    email  = email.strip().lower()
    record = _pending_otps.get(email)

    if not record:
        raise ValueError("No code was requested for this email. Please try again.")

    if datetime.utcnow() > record["expires_at"]:
        _pending_otps.pop(email, None)
        raise ValueError("Code has expired. Please request a new one.")

    if record["otp"] != otp.strip():
        raise ValueError("Incorrect code. Please check and try again.")

    _pending_otps.pop(email, None)

    token = uuid.uuid4().hex
    _sessions[token] = {
        "email":      email,
        "created_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }
    return token


def get_session(token: str) -> Optional[dict]:
    """Return session dict if valid and not expired, else None."""
    session = _sessions.get(token)
    if not session:
        return None
    created = datetime.fromisoformat(session["created_at"].rstrip("Z"))
    if datetime.utcnow() - created > timedelta(hours=SESSION_EXPIRY_HOURS):
        _sessions.pop(token, None)
        return None
    return session


def list_users() -> list:
    """Return all active verified users (for admin dashboard)."""
    return [
        {"email": s["email"], "verified_at": s["created_at"]}
        for s in _sessions.values()
    ]
