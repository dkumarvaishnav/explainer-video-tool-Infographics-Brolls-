"""
In-memory rolling log buffer + async SSE stream.

LogBuffer is a standard logging.Handler that captures every log record
and stores it in a deque. The /logs/stream endpoint polls this buffer
and pushes new lines to connected SSE clients.
"""

import asyncio
import logging
import traceback
from collections import deque
from datetime import datetime
from typing import AsyncGenerator


class LogBuffer(logging.Handler):
    def __init__(self, maxlen: int = 2000):
        super().__init__()
        self._buffer: deque[str] = deque(maxlen=maxlen)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            ts = datetime.fromtimestamp(record.created).strftime("%H:%M:%S.%f")[:-3]
            level = record.levelname
            name = record.name.split(".")[-1]
            msg = record.getMessage()
            if record.exc_info:
                msg += "\n" + "".join(traceback.format_exception(*record.exc_info)).rstrip()
            self._buffer.append(f"[{ts}] {level:<8} {name}: {msg}")
        except Exception:
            pass  # never let the logging system crash the app

    def size(self) -> int:
        return len(self._buffer)

    async def stream(self) -> AsyncGenerator[str, None]:
        """Yield all buffered lines, then poll every 400 ms for new ones."""
        sent = 0
        snapshot = list(self._buffer)
        for line in snapshot:
            yield line
        sent = len(snapshot)
        while True:
            await asyncio.sleep(0.4)
            current = list(self._buffer)
            if len(current) > sent:
                for line in current[sent:]:
                    yield line
                sent = len(current)


log_buffer = LogBuffer()
