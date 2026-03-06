"""
auth.py — Email OTP authentication
------------------------------------
How it works:
  1. User enters their email on the frontend
  2. Backend generates a random 6-digit OTP, stores it in memory (10 min expiry)
  3. Backend calls the Vercel relay function (EMAIL_RELAY_URL) which sends the
     OTP via Gmail SMTP — this relay is needed because HuggingFace Spaces blocks
     all outbound SMTP connections, but Vercel's servers can reach Gmail fine
  4. User enters the OTP → backend verifies → returns a 24-hour session token
  5. All subsequent requests include the token in X-Auth-Token header

Required environment variables (set in HuggingFace Space secrets):
  EMAIL_RELAY_URL    = https://<your-vercel-app>.vercel.app/api/send-email
  EMAIL_RELAY_SECRET = (shared secret — must match RELAY_SECRET on Vercel)

Required environment variables (set in Vercel project settings):
  GMAIL_USER         = 776438@gmail.com
  GMAIL_APP_PASSWORD = (Gmail App Password — not your regular password)
  RELAY_SECRET       = (same shared secret as above)

Dev mode (no email configured):
  If EMAIL_RELAY_URL is not set, the OTP is printed to the server console.
  This is safe for local development.
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

# ── Configuration ──────────────────────────────────────────────────────────
# URL of the Vercel serverless function that sends the email via Gmail SMTP
EMAIL_RELAY_URL    = os.getenv("EMAIL_RELAY_URL", "")
# Shared secret that the relay function checks to reject unauthorised callers
EMAIL_RELAY_SECRET = os.getenv("EMAIL_RELAY_SECRET", "")

OTP_EXPIRY_MINUTES   = 10   # OTP expires after this many minutes
SESSION_EXPIRY_HOURS = 24   # Session token expires after this many hours

# ── In-memory storage ──────────────────────────────────────────────────────
# These reset on server restart — fine for a stateless demo app.
# For production use a persistent store like Redis or a database.
_pending_otps: dict = {}   # email → {"otp": "123456", "expires_at": datetime}
_sessions: dict     = {}   # token → {"email": "...", "created_at": "..."}


# ── Email content ──────────────────────────────────────────────────────────

def _generate_otp() -> str:
    """Generate a random 6-digit numeric OTP."""
    return "".join(random.choices(string.digits, k=6))


def _otp_email_html(otp: str) -> str:
    """Build the HTML body for the OTP verification email."""
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


# ── Email sending ──────────────────────────────────────────────────────────

def _send_via_relay(to_email: str, subject: str, html_body: str) -> None:
    """
    POST the email details to the Vercel relay function.

    The relay function runs on Vercel's servers which can reach Gmail SMTP,
    bypassing HuggingFace Spaces' outbound connection restrictions.
    """
    payload = json.dumps({
        "to":      to_email,
        "subject": subject,
        "html":    html_body,
    }).encode("utf-8")

    req = urllib.request.Request(
        EMAIL_RELAY_URL,
        data=payload,
        headers={
            "Content-Type":   "application/json",
            "X-Relay-Secret": EMAIL_RELAY_SECRET,  # prevents abuse of the relay
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
    Generate an OTP for the given email and send it.

    Returns:
        True  — email was sent via the relay
        False — dev mode, OTP printed to server console (no relay configured)
    """
    email = email.strip().lower()
    otp   = _generate_otp()

    # Store the OTP with an expiry timestamp
    _pending_otps[email] = {
        "otp":        otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    }

    if EMAIL_RELAY_URL and EMAIL_RELAY_SECRET:
        # Production: send real email via the Vercel relay → Gmail SMTP
        _send_via_relay(email, "Your Document AI verification code", _otp_email_html(otp))
        return True

    # Dev mode: no relay configured — print OTP to console so you can still test
    print(f"\n{'='*52}")
    print(f"  [DEV MODE] OTP for {email}:  {otp}")
    print(f"  Set EMAIL_RELAY_URL + EMAIL_RELAY_SECRET to send real emails.")
    print(f"{'='*52}\n")
    return False


def verify_otp(email: str, otp: str) -> str:
    """
    Verify the OTP submitted by the user.

    Returns:
        A new session token (UUID hex string) valid for SESSION_EXPIRY_HOURS.

    Raises:
        ValueError — if no OTP was requested, it expired, or the code is wrong.
    """
    email  = email.strip().lower()
    record = _pending_otps.get(email)

    if not record:
        raise ValueError("No code was requested for this email. Please try again.")

    if datetime.utcnow() > record["expires_at"]:
        _pending_otps.pop(email, None)
        raise ValueError("Code has expired. Please request a new one.")

    if record["otp"] != otp.strip():
        raise ValueError("Incorrect code. Please check and try again.")

    # OTP is correct — remove it so it can't be reused
    _pending_otps.pop(email, None)

    # Create a new session token and store it
    token = uuid.uuid4().hex
    _sessions[token] = {
        "email":      email,
        "created_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }
    return token


def get_session(token: str) -> Optional[dict]:
    """
    Look up a session by token.

    Returns:
        The session dict {"email": ..., "created_at": ...} if valid,
        or None if the token doesn't exist or has expired.
    """
    session = _sessions.get(token)
    if not session:
        return None

    # Check if the session has exceeded its expiry time
    created = datetime.fromisoformat(session["created_at"].rstrip("Z"))
    if datetime.utcnow() - created > timedelta(hours=SESSION_EXPIRY_HOURS):
        _sessions.pop(token, None)
        return None

    return session


def list_users() -> list:
    """Return all currently active sessions — used by the admin dashboard."""
    return [
        {"email": s["email"], "verified_at": s["created_at"]}
        for s in _sessions.values()
    ]
