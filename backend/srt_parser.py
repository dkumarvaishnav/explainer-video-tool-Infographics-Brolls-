"""
SRT parser - converts subtitle file content into Scene objects.

These parsed scenes are only a staging layer for the LLM mapping step. The LLM
can still replace, merge, split, or reclassify them into INFOGRAPHIC or BROLL.
"""

import re
from typing import List

from backend.schemas import Scene

_SRT_BLOCK_RE = re.compile(
    r"\d+\s*\n"
    r"(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*\n"
    r"((?:(?!\n\n)[\s\S])+)",
    re.MULTILINE,
)


def _ts_to_seconds(ts: str) -> float:
    """Convert 'HH:MM:SS,mmm' or 'HH:MM:SS.mmm' to float seconds."""
    ts = ts.replace(",", ".")
    h, m, rest = ts.split(":")
    s, ms = rest.split(".")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def _pick_type(duration: float, idx: int) -> str:
    """Assign a rough initial asset type based on clip duration."""
    if duration < 4.0:
        return "BROLL"
    if duration < 7.0:
        return "INFOGRAPHIC" if idx % 2 == 0 else "BROLL"
    return "INFOGRAPHIC"


def parse_srt(content: str) -> List[Scene]:
    """
    Parse SRT text and return a list of provisional Scene objects.

    Subtitle text is stored as source_text. The user-facing description remains
    editable and is later turned into a prompt only after approval.
    """
    scenes: List[Scene] = []
    for idx, match in enumerate(_SRT_BLOCK_RE.finditer(content)):
        start_ts = match.group(1).replace(".", ",")
        end_ts = match.group(2).replace(".", ",")
        text_raw = match.group(3).strip()
        text_clean = re.sub(r"<[^>]+>", "", text_raw).strip()

        start_sec = _ts_to_seconds(start_ts)
        end_sec = _ts_to_seconds(end_ts)
        duration = max(0.0, end_sec - start_sec)

        scene_type = _pick_type(duration, idx)
        description = text_clean[:120] if text_clean else f"Scene {idx + 1}"

        scenes.append(
            Scene(
                id=idx + 1,
                type=scene_type,
                description=description,
                source_text=text_clean,
                text=None,
                start_time=start_ts,
                end_time=end_ts,
                estimated=False,
                aspect_ratio="16:9",
                image_count=1,
                status="pending",
            )
        )

    return scenes
