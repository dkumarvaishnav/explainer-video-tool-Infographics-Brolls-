"""
In-memory session store with JSON persistence and per-session async locks.

Sessions are held in a dict keyed by session_id.
Each session is also written to /sessions/<session_id>.json so state
survives a server restart.

Concurrency model:
    Every session gets its own asyncio.Lock created at session creation and
    at restore time. All mutating operations (update, persist, load) must be
    called inside with_lock() to prevent races between the generation worker
    and any concurrent API requests (stop, status, regenerate, etc.).
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Awaitable, Callable, Optional, TypeVar

import aiofiles

from backend.schemas import Session

logger = logging.getLogger(__name__)

SESSIONS_DIR = Path(__file__).parent.parent / "sessions"

T = TypeVar("T")


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self.locks: dict[str, asyncio.Lock] = {}

    # ------------------------------------------------------------------
    # Lock helper
    # ------------------------------------------------------------------

    def _ensure_lock(self, session_id: str) -> None:
        """Create a lock for session_id if one does not already exist."""
        if session_id not in self.locks:
            self.locks[session_id] = asyncio.Lock()

    async def with_lock(self, session_id: str, fn: Callable[[], Awaitable[T]]) -> T:
        """
        Acquire the per-session lock, run an async callable, release the lock.

        Usage:
            result = await store.with_lock(session_id, async_lambda)
        """
        if session_id not in self.locks:
            raise KeyError(f"No lock found for session '{session_id}'")
        async with self.locks[session_id]:
            return await fn()

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def get(self, session_id: str) -> Optional[Session]:
        return self._sessions.get(session_id)

    def create(self, session: Session) -> Session:
        self._ensure_lock(session.session_id)
        self._sessions[session.session_id] = session
        return session

    def update(self, session: Session) -> Session:
        self._sessions[session.session_id] = session
        return session

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
        self.locks.pop(session_id, None)
        path = SESSIONS_DIR / f"{session_id}.json"
        if path.exists():
            path.unlink()

    def all_ids(self) -> list[str]:
        return list(self._sessions.keys())

    def all_sessions(self) -> list[Session]:
        return list(self._sessions.values())

    # ------------------------------------------------------------------
    # JSON persistence  (always call inside with_lock)
    # ------------------------------------------------------------------

    async def persist(self, session: Session) -> None:
        """Write session to disk as JSON. Must be called inside with_lock()."""
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        session.updated_at = datetime.now(timezone.utc)
        path = SESSIONS_DIR / f"{session.session_id}.json"
        async with aiofiles.open(path, "w", encoding="utf-8") as f:
            await f.write(session.model_dump_json(indent=2))

    async def load(self, session_id: str) -> Optional[Session]:
        """
        Load a single session from disk into memory.
        Creates a lock for the session if one does not exist.
        Must be called inside with_lock() for sessions that are already active;
        safe to call without a lock during startup (restore_all).
        """
        path = SESSIONS_DIR / f"{session_id}.json"
        if not path.exists():
            return None
        async with aiofiles.open(path, encoding="utf-8") as f:
            raw = await f.read()
        session = Session.model_validate(json.loads(raw))
        self._ensure_lock(session_id)
        self._sessions[session_id] = session
        return session

    async def restore_all(self) -> None:
        """
        Load all persisted sessions from disk on startup.
        Called once before the server starts accepting requests — no locking needed.
        """
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        self.delete_expired(days=30)
        for path in SESSIONS_DIR.glob("*.json"):
            try:
                await self.load(path.stem)
            except Exception:
                logger.warning("Failed to restore session from %s", path)

    def delete_expired(self, days: int = 30) -> None:
        """Delete session files whose modification time is older than days."""
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        for path in SESSIONS_DIR.glob("*.json"):
            try:
                mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
                if mtime < cutoff:
                    session_id = path.stem
                    path.unlink()
                    self._sessions.pop(session_id, None)
                    self.locks.pop(session_id, None)
                    logger.info("Deleted expired session %s", session_id)
            except Exception:
                logger.warning("Failed to check session expiry for %s", path)


# Module-level singleton — import this everywhere
store = SessionStore()
