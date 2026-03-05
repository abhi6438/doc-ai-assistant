"""
analytics.py
------------
Lightweight file-based usage analytics — zero extra dependencies.

Events are appended as JSON lines to analytics.jsonl on disk.
The /admin/stats endpoint reads this file and returns aggregated stats.

What is tracked:
  - document_upload  : filename, size, chunks, timestamp, user IP
  - question_asked   : question text, response length, backend, timestamp, IP
  - page_view        : logged via Google Analytics 4 on the frontend
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from collections import Counter

# Store events next to this file (persists across restarts)
ANALYTICS_FILE = Path(__file__).parent / "analytics.jsonl"


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def log_event(event_type: str, data: dict, client_ip: str = "unknown") -> None:
    """
    Append one event as a JSON line to the analytics log file.

    Args:
        event_type: e.g. "document_upload" | "question_asked"
        data:       Arbitrary dict with event-specific fields
        client_ip:  Requester IP (from FastAPI Request object)
    """
    event = {
        "type":      event_type,
        "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "ip":        client_ip,
        "data":      data,
    }
    try:
        with open(ANALYTICS_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")
    except Exception:
        pass  # Never let analytics crash the main app


# ---------------------------------------------------------------------------
# Read & aggregate
# ---------------------------------------------------------------------------

def _load_events() -> list:
    """Read all events from disk, silently skip corrupted lines."""
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


def get_stats() -> dict:
    """
    Return aggregated usage statistics.

    Returns a dict with:
      - summary counts
      - recent activity lists
      - daily usage for the last 7 days (for a simple chart)
      - top questions
    """
    events = _load_events()
    now = datetime.utcnow()

    uploads   = [e for e in events if e["type"] == "document_upload"]
    questions = [e for e in events if e["type"] == "question_asked"]

    # ── Last 24 h / 7 days ────────────────────────────────────
    cutoff_24h = (now - timedelta(hours=24)).isoformat()
    cutoff_7d  = (now - timedelta(days=7)).isoformat()

    uploads_24h   = [e for e in uploads   if e["timestamp"] >= cutoff_24h]
    questions_24h = [e for e in questions if e["timestamp"] >= cutoff_24h]
    uploads_7d    = [e for e in uploads   if e["timestamp"] >= cutoff_7d]
    questions_7d  = [e for e in questions if e["timestamp"] >= cutoff_7d]

    # ── Unique IPs ────────────────────────────────────────────
    all_ips     = {e["ip"] for e in events if e.get("ip") not in ("unknown", None)}
    ips_7d      = {e["ip"] for e in events
                   if e["timestamp"] >= cutoff_7d and e.get("ip") not in ("unknown", None)}

    # ── Daily breakdown (last 7 days) ─────────────────────────
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

    # ── Top questions ─────────────────────────────────────────
    q_texts = [e["data"].get("question", "")[:120] for e in questions if e["data"].get("question")]
    top_questions = [q for q, _ in Counter(q_texts).most_common(10)]

    # ── Recent activity feed ──────────────────────────────────
    recent = sorted(events, key=lambda e: e["timestamp"], reverse=True)[:20]
    recent_feed = []
    for e in recent:
        if e["type"] == "document_upload":
            recent_feed.append({
                "type":  "upload",
                "label": e["data"].get("filename", "unknown"),
                "detail": f"{e['data'].get('chunks_stored', '?')} chunks",
                "time":  e["timestamp"],
                "ip":    e.get("ip", "—"),
            })
        elif e["type"] == "question_asked":
            q = e["data"].get("question", "")
            recent_feed.append({
                "type":  "question",
                "label": q[:80] + ("…" if len(q) > 80 else ""),
                "detail": e["data"].get("backend", ""),
                "time":  e["timestamp"],
                "ip":    e.get("ip", "—"),
            })

    return {
        "summary": {
            "total_uploads":       len(uploads),
            "total_questions":     len(questions),
            "total_events":        len(events),
            "unique_users_all":    len(all_ips),
            "unique_users_7d":     len(ips_7d),
            "uploads_last_24h":    len(uploads_24h),
            "questions_last_24h":  len(questions_24h),
            "uploads_last_7d":     len(uploads_7d),
            "questions_last_7d":   len(questions_7d),
        },
        "daily_chart": [
            {"date": day, **counts}
            for day, counts in daily.items()
        ],
        "top_questions":  top_questions,
        "recent_activity": recent_feed,
    }
