"""
analytics.py — Usage analytics with persistent storage
--------------------------------------------------------
Events are stored in two places:
  1. Supabase (PostgreSQL) — persistent across HF Space restarts (primary)
  2. analytics.jsonl on disk — local fallback / dev mode

Events tracked:
  user_login       : email, timestamp, IP
  document_upload  : email, filename, file size, chunks stored, timestamp, IP
  question_asked   : email, question text, answer length, LLM backend, timestamp, IP

Required env vars (set in HuggingFace Space secrets):
  SUPABASE_URL      = https://xxxx.supabase.co
  SUPABASE_ANON_KEY = your-anon-key

Supabase table setup (run once in Supabase SQL Editor):
  CREATE TABLE analytics_events (
    id          bigserial primary key,
    event_type  text NOT NULL,
    user_email  text,
    data        jsonb,
    ip          text,
    created_at  timestamptz DEFAULT now()
  );
  ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "insert_anon" ON analytics_events FOR INSERT TO anon WITH CHECK (true);
  CREATE POLICY "select_anon" ON analytics_events FOR SELECT TO anon USING (true);
"""

import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from collections import Counter

# ── Config ─────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# Local JSONL file — used as fallback when Supabase is not configured
ANALYTICS_FILE = Path(__file__).parent / "analytics.jsonl"


# ── Supabase helpers ───────────────────────────────────────────────────────

def _supabase_insert(event: dict) -> None:
    """Insert one event row into the Supabase analytics_events table."""
    payload = json.dumps({
        "event_type": event["type"],
        "user_email": event["data"].get("user_email", ""),
        "data":       event["data"],
        "ip":         event.get("ip", "unknown"),
        "created_at": event["timestamp"],
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/analytics_events",
        data=payload,
        headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "return=minimal",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as _:
        pass


def _supabase_fetch(limit: int = 1000) -> list:
    """Fetch all events from Supabase ordered by most recent first."""
    url = (
        f"{SUPABASE_URL}/rest/v1/analytics_events"
        f"?select=*&order=created_at.desc&limit={limit}"
    )
    req = urllib.request.Request(
        url,
        headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        rows = json.loads(resp.read().decode())

    # Normalise Supabase rows to the same shape used by the local JSONL events
    events = []
    for row in rows:
        events.append({
            "type":      row["event_type"],
            "timestamp": row["created_at"],
            "ip":        row.get("ip", "unknown"),
            "data":      row.get("data") or {},
        })
    return events


# ── Local JSONL helpers (fallback) ─────────────────────────────────────────

def _jsonl_append(event: dict) -> None:
    """Append one event to the local analytics.jsonl file."""
    try:
        with open(ANALYTICS_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")
    except Exception:
        pass  # Never let analytics errors crash the main app


def _jsonl_load() -> list:
    """Read all events from the local JSONL file."""
    if not ANALYTICS_FILE.exists():
        return []
    events = []
    with open(ANALYTICS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return events


# ── Public API ─────────────────────────────────────────────────────────────

def log_event(event_type: str, data: dict, client_ip: str = "unknown") -> None:
    """
    Record one analytics event.

    Writes to Supabase (if configured) and also to the local JSONL file.
    Never raises — analytics must never crash the main app.

    Args:
        event_type : 'user_login' | 'document_upload' | 'question_asked'
        data       : event-specific fields (always include user_email)
        client_ip  : caller's IP address
    """
    event = {
        "type":      event_type,
        "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "ip":        client_ip,
        "data":      data,
    }

    # Write to Supabase (persistent across restarts)
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            _supabase_insert(event)
        except Exception as exc:
            print(f"[analytics] Supabase insert failed: {exc}")

    # Always write to local file as backup / dev fallback
    _jsonl_append(event)


def get_stats() -> dict:
    """
    Return aggregated analytics for the admin dashboard.

    Reads from Supabase if configured, otherwise from local JSONL.

    Returns:
        summary        : total counts and recent period counts
        daily_chart    : uploads + questions per day for the last 7 days
        top_questions  : 10 most frequently asked questions
        recent_activity: 20 most recent events (uploads + questions)
        per_user       : per-user breakdown (logins, uploads, questions)
    """
    # Load events from the best available source
    try:
        if SUPABASE_URL and SUPABASE_KEY:
            events = _supabase_fetch(limit=2000)
        else:
            events = _jsonl_load()
    except Exception as exc:
        print(f"[analytics] Failed to load events: {exc}")
        events = _jsonl_load()   # fall back to local file

    now = datetime.utcnow()

    logins    = [e for e in events if e["type"] == "user_login"]
    uploads   = [e for e in events if e["type"] == "document_upload"]
    questions = [e for e in events if e["type"] == "question_asked"]

    # ── Time-windowed counts ───────────────────────────────────────────────
    cutoff_24h = (now - timedelta(hours=24)).isoformat()
    cutoff_7d  = (now - timedelta(days=7)).isoformat()

    uploads_24h   = [e for e in uploads   if e["timestamp"] >= cutoff_24h]
    questions_24h = [e for e in questions if e["timestamp"] >= cutoff_24h]
    uploads_7d    = [e for e in uploads   if e["timestamp"] >= cutoff_7d]
    questions_7d  = [e for e in questions if e["timestamp"] >= cutoff_7d]

    all_ips = {e["ip"] for e in events if e.get("ip") not in ("unknown", None)}
    ips_7d  = {e["ip"] for e in events
               if e["timestamp"] >= cutoff_7d and e.get("ip") not in ("unknown", None)}

    # ── Daily breakdown — last 7 days ──────────────────────────────────────
    daily = {}
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        daily[day] = {"uploads": 0, "questions": 0}

    for e in events:
        day = e["timestamp"][:10]
        if day in daily:
            if e["type"] == "document_upload":
                daily[day]["uploads"] += 1
            elif e["type"] == "question_asked":
                daily[day]["questions"] += 1

    # ── Top questions ──────────────────────────────────────────────────────
    q_texts       = [e["data"].get("question", "")[:120] for e in questions if e["data"].get("question")]
    top_questions = [q for q, _ in Counter(q_texts).most_common(10)]

    # ── Recent activity feed ───────────────────────────────────────────────
    recent      = sorted(events, key=lambda e: e["timestamp"], reverse=True)[:20]
    recent_feed = []
    for e in recent:
        if e["type"] == "user_login":
            recent_feed.append({
                "type":   "login",
                "label":  e["data"].get("user_email", "unknown"),
                "detail": "logged in",
                "time":   e["timestamp"],
                "ip":     e.get("ip", "—"),
            })
        elif e["type"] == "document_upload":
            recent_feed.append({
                "type":   "upload",
                "label":  e["data"].get("filename", "unknown"),
                "detail": f"{e['data'].get('chunks_stored', '?')} chunks · {e['data'].get('user_email', '')}",
                "time":   e["timestamp"],
                "ip":     e.get("ip", "—"),
            })
        elif e["type"] == "question_asked":
            q = e["data"].get("question", "")
            recent_feed.append({
                "type":   "question",
                "label":  q[:80] + ("…" if len(q) > 80 else ""),
                "detail": f"{e['data'].get('backend', '')} · {e['data'].get('user_email', '')}",
                "time":   e["timestamp"],
                "ip":     e.get("ip", "—"),
            })

    # ── Per-user breakdown ─────────────────────────────────────────────────
    # Build a summary for each unique email: last login, upload count, question count
    user_map: dict = {}
    for e in events:
        email = e["data"].get("user_email", "")
        if not email:
            continue
        if email not in user_map:
            user_map[email] = {"email": email, "logins": 0, "uploads": 0, "questions": 0, "last_seen": ""}
        if e["type"] == "user_login":
            user_map[email]["logins"] += 1
        elif e["type"] == "document_upload":
            user_map[email]["uploads"] += 1
        elif e["type"] == "question_asked":
            user_map[email]["questions"] += 1
        if e["timestamp"] > user_map[email]["last_seen"]:
            user_map[email]["last_seen"] = e["timestamp"]

    per_user = sorted(user_map.values(), key=lambda u: u["last_seen"], reverse=True)

    return {
        "summary": {
            "total_uploads":      len(uploads),
            "total_questions":    len(questions),
            "total_logins":       len(logins),
            "total_events":       len(events),
            "unique_users_all":   len(all_ips),
            "unique_users_7d":    len(ips_7d),
            "uploads_last_24h":   len(uploads_24h),
            "questions_last_24h": len(questions_24h),
            "uploads_last_7d":    len(uploads_7d),
            "questions_last_7d":  len(questions_7d),
        },
        "daily_chart":    [{"date": day, **counts} for day, counts in daily.items()],
        "top_questions":  top_questions,
        "recent_activity": recent_feed,
        "per_user":       per_user,
    }
