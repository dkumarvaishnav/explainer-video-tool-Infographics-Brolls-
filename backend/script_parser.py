"""
Script parser — stores raw script content on the session.

For Mode B (raw script), the LLM mapping step creates the actual scenes.
This module just validates the input and optionally splits the script into
rough paragraphs so the session has something to display before LLM mapping.
"""
from typing import List, Optional

from backend.schemas import Scene


def parse_script(
    content: str,
    duration_estimate: Optional[int] = None,
    scene_count_hint: Optional[int] = None,
) -> List[Scene]:
    """
    For raw script mode we don't pre-build scenes — the LLM does that.
    Returns an empty list; /generate-mapping will populate session.scenes.
    """
    _ = content, duration_estimate, scene_count_hint  # consumed by LLM later
    return []
