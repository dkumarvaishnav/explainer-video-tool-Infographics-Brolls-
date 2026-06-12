"""
Scoring layer — wraps llm_service.score_image() with hard-fail rules
and background validation.

Public coroutine:
    score_image(scene, image_path, style) -> (passed, score, issues)
"""

from pathlib import Path
from typing import Optional

from backend import llm_service
from backend.background_validator import validate_background
from backend.schemas import Scene, StyleConfig

_SCORE_THRESHOLD = 7.5
_MIN_FILE_SIZE = 5 * 1024  # 5 KB — below this is treated as a blank/corrupt image

_HARD_FAIL_SIGNALS = {
    "wrong text",
    "missing text",
    "incorrect text",
    "no text",
    "blank",
    "wrong subject",
    "wrong background",
    "incorrect background",
}

async def score_image(
    scene: Scene,
    image_path: Optional[str],
    style: StyleConfig,
) -> tuple[bool, float, list[str]]:
    """
    Score a generated image against the scene brief.

    Pre-flight checks (short-circuit before calling the LLM):
        1. image_path is None          → fail: "generation failed"
        2. file does not exist on disk → fail: "missing file"
        3. file size < 5 KB            → fail: "blank image"

    Then:
        4. Call llm_service.score_image() for LLM-based evaluation.
        5. Collect hard-fail signals from the issues list.
        6. Run validate_background() as an additional hard-fail check.
        7. Pass only when score >= threshold AND no hard fail detected.

    Args:
        scene:      The Scene the image was generated for.
        image_path: Path to the PNG file on disk, or None if generation failed.
        style:      The session StyleConfig (provides background_color).

    Returns:
        (passed, score, issues)
        passed: True if score >= 7.5 and no hard-fail condition triggered.
        score:  Float from 0.0 to 10.0.
        issues: Combined list of all detected problems.
    """
    # --- Pre-flight checks ---
    if image_path is None:
        return False, 0.0, ["generation failed"]

    path = Path(image_path)
    if not path.exists():
        return False, 0.0, ["missing file"]

    if path.stat().st_size < _MIN_FILE_SIZE:
        return False, 0.0, ["blank image"]

    # --- LLM evaluation ---
    result = await llm_service.score_image(scene, image_path, style)

    score: float = result.score
    issues: list[str] = list(result.issues)
    hard_fail: bool = result.hard_fail

    # Re-derive hard_fail from issues in case llm_service's signal set missed
    # a phrasing variant — this module owns the authoritative rule.
    if not hard_fail:
        hard_fail = any(
            any(signal in issue.lower() for signal in _HARD_FAIL_SIGNALS)
            for issue in issues
        )

    # Background validation — treated as a hard fail if it doesn't pass
    if not validate_background(image_path, style.background_color):
        hard_fail = True
        issues.append("Background colour does not match expected value")

    passed = (score >= _SCORE_THRESHOLD) and (not hard_fail)

    return passed, score, issues
