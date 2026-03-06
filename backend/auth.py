"""
auth.py — Email OTP authentication
-----------------------------------
Tries multiple HTTP-based email APIs in order (no SMTP — works on HuggingFace Spaces):
  1. Brevo (formerly Sendinblue) — free 300 emails/day, sign up at brevo.com
  2. SendGrid — free 100 emails/day, sign up at sendgrid.com
  3. Resend — free 3000/month (may be blocked on some cloud IPs)
  4. Dev mode — prints OTP to server console

Setup (Brevo — recommended):
  1. Sign up at brevo.com (free, no credit card)
  2. Go to Account → SMTP & API → API Keys → Generate
  3. Set BREVO_API_KEY=your_key in environment variables
  4. Set EMAIL_FROM_ADDR to your verified sender email
  5. To verify sender: Brevo dashboard → Senders & IPs → Senders → Add a sender
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
BREVO_API_KEY    = os.getenv("BREVO_API_KEY", "")
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
RESEND_API_KEY   = os.getenv("RESEND_API_KEY", "")

EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Document AI")
EMAIL_FROM_ADDR = os.getenv("EMAIL_FROM_ADDR", "")   # e.g. you@yourdomain.com

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


def _http_post(url: str, payload: dict, headers: dict) -> None:
    """Generic HTTP POST helper."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status not in (200, 201, 202):
                raise RuntimeError(f"HTTP {resp.status}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"HTTP {e.code}: {body[:300]}")


def _send_via_brevo(to_email: str, subject: str, html_body: str) -> None:
    """Send via Brevo (formerly Sendinblue) HTTP API — works on HuggingFace Spaces."""
    _http_post(
        "https://api.brevo.com/v3/smtp/email",
        {
            "sender":      {"name": EMAIL_FROM_NAME, "email": EMAIL_FROM_ADDR},
            "to":          [{"email": to_email}],
            "subject":     subject,
            "htmlContent": html_body,
        },
        {
            "api-key":      BREVO_API_KEY,
            "Content-Type": "application/json",
            "Accept":       "application/json",
        },
    )


def _send_via_sendgrid(to_email: str, subject: str, html_body: str) -> None:
    """Send via SendGrid HTTP API."""
    _http_post(
        "https://api.sendgrid.com/v3/mail/send",
        {
            "from":             {"email": EMAIL_FROM_ADDR, "name": EMAIL_FROM_NAME},
            "personalizations": [{"to": [{"email": to_email}]}],
            "subject":          subject,
            "content":          [{"type": "text/html", "value": html_body}],
        },
        {
            "Authorization": f"Bearer {SENDGRID_API_KEY}",
            "Content-Type":  "application/json",
        },
    )


def _send_via_resend(to_email: str, subject: str, html_body: str) -> None:
    """Send via Resend HTTP API (may be blocked on some cloud IPs)."""
    from_addr = f"{EMAIL_FROM_NAME} <{EMAIL_FROM_ADDR}>" if EMAIL_FROM_ADDR else f"{EMAIL_FROM_NAME} <onboarding@resend.dev>"
    _http_post(
        "https://api.resend.com/emails",
        {
            "from":    from_addr,
            "to":      [to_email],
            "subject": subject,
            "html":    html_body,
        },
        {
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type":  "application/json",
        },
    )


# ── Public API ─────────────────────────────────────────────────────────────

def request_otp(email: str) -> bool:
    """
    Generate a 6-digit OTP and send it to the email.
    Returns True if email was sent, False in dev mode (check server console).
    """
    email = email.strip().lower()
    otp   = _generate_otp()
    _pending_otps[email] = {
        "otp":        otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    }

    subject = "Your Document AI verification code"

    # ── Brevo (recommended — works on HuggingFace Spaces) ─────────────────
    if BREVO_API_KEY and EMAIL_FROM_ADDR:
        _send_via_brevo(email, subject, _otp_email_html(otp))
        return True

    # ── SendGrid ───────────────────────────────────────────────────────────
    if SENDGRID_API_KEY and EMAIL_FROM_ADDR:
        _send_via_sendgrid(email, subject, _otp_email_html(otp))
        return True

    # ── Resend (fallback — may be blocked on HF Spaces) ───────────────────
    if RESEND_API_KEY:
        _send_via_resend(email, subject, _otp_email_html(otp))
        return True

    # ── Dev mode — no email configured ────────────────────────────────────
    print(f"\n{'='*52}")
    print(f"  [DEV MODE] OTP for {email}:  {otp}")
    print(f"  (set BREVO_API_KEY + EMAIL_FROM_ADDR in environment)")
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
