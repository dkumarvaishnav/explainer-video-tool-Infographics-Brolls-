"""
Structured event logger for the generation pipeline.

Public function:
    log_event(type, message, session_id, scene_id)

Writes append-only plain-text lines to:
    sessions/{session_id}_log.txt

Each line format:
    [YYYY-MM-DD HH:MM:SS] [TYPE    ] [session:{id}] [scene:{id}] message
"""

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

logger = logging.getLogger(__name__)

LogType = Literal["INFO", "ERROR", "RETRY", "PAUSE"]

_SESSIONS_DIR = Path("sessions")
_TYPE_WIDTH = 7  # pad all type labels to the same width


def _format_line(
    log_type: LogType,
    message: str,
    session_id: str,
    scene_id: Optional[int],
) -> str:
    ts = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    scene_part = f"scene:{scene_id}" if scene_id is not None else "scene:-"
    return f"[{ts}] [{log_type:<{_TYPE_WIDTH}}] [session:{session_id}] [{scene_part}] {message}\n"


def log_event(
    log_type: LogType,
    message: str,
    session_id: str,
    scene_id: Optional[int] = None,
) -> None:
    """
    Append a structured log entry to sessions/{session_id}_log.txt.

    Args:
        log_type:   One of "INFO", "ERROR", "RETRY", "PAUSE".
        message:    Human-readable description of the event.
        session_id: ID of the active session.
        scene_id:   Optional scene number. Omit for session-level events.

    Thread / async safety:
        Uses synchronous file I/O with append mode — safe under asyncio's
        single-threaded event loop. Does NOT acquire any lock; callers that
        need strict ordering should call from within a with_lock block.
    """
    _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = _SESSIONS_DIR / f"{session_id}_log.txt"
    line = _format_line(log_type, message, session_id, scene_id)

    try:
        with log_path.open("a", encoding="utf-8") as f:
            f.write(line)
    except OSError as exc:
        # Never let logging failures crash the pipeline
        logger.warning("Failed to write log entry to %s: %s", log_path, exc)
