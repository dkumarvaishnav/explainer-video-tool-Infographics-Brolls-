"""
LLM service - all Gemini API calls.

The app now uses Gemini for planning and prompt writing only. It does not call
image or video generation providers directly.
"""

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types

from backend.schemas import Scene, StyleConfig

load_dotenv()
logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-2.5-flash"
_GEMINI_TIMEOUT = 90.0

_VALID_SCENE_TYPES = {"INFOGRAPHIC", "BROLL"}
_VALID_ASPECT_RATIOS = {"1:1", "16:9"}
_MAX_SCENE_SECONDS = 5.0


@dataclass
class ScoreResult:
    score: float
    issues: list[str] = field(default_factory=list)
    hard_fail: bool = False


_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set")
        _client = genai.Client(api_key=api_key)
    return _client


def _make_config(system_instruction: str, *, json_mode: bool) -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json" if json_mode else "text/plain",
        temperature=0.25,
        top_p=0.9,
    )


_FENCE_RE = re.compile(r"```(?:json|text)?\s*(.*?)\s*```", re.DOTALL)
_LABEL_RE = re.compile(r"^\s*[\w\s]{1,28}:\s*", re.MULTILINE)


def _strip_fences(text: str) -> str:
    match = _FENCE_RE.search(text)
    return match.group(1) if match else text.strip()


def _parse_json(text: str) -> Any:
    return json.loads(_strip_fences(text))


def _clean_prompt_text(text: str) -> str:
    text = _strip_fences(text or "")
    text = _LABEL_RE.sub("", text, count=1)
    return text.strip()


def _normalise_scene_dict(item: dict, fallback_id: int) -> dict:
    item = dict(item)
    item.setdefault("id", fallback_id)
    item.setdefault("type", "INFOGRAPHIC")
    item.setdefault("description", f"Scene {fallback_id}")
    item.setdefault("source_text", item.get("text"))
    item.setdefault("text", None)
    item.setdefault("start_time", None)
    item.setdefault("end_time", None)
    item.setdefault("estimated", False)
    item.setdefault("aspect_ratio", "16:9")
    item.setdefault("image_count", 1)
    item.setdefault("status", "pending")
    item.setdefault("image_paths", [])
    item.setdefault("attempts", 0)
    item.setdefault("score", None)
    item.setdefault("prompt", None)

    raw_type = str(item.get("type", "INFOGRAPHIC")).upper().strip()
    if raw_type in {"VIDEO", "VIDEO_BROLL", "B-ROLL", "B ROLL", "BRoll".upper()}:
        raw_type = "BROLL"
    if raw_type not in _VALID_SCENE_TYPES:
        logger.warning("Invalid scene type %r -> coercing to INFOGRAPHIC", raw_type)
        raw_type = "INFOGRAPHIC"
    item["type"] = raw_type

    if item.get("aspect_ratio") not in _VALID_ASPECT_RATIOS:
        item["aspect_ratio"] = "16:9"

    try:
        item["id"] = int(item["id"])
    except (TypeError, ValueError):
        item["id"] = fallback_id

    return item


def _build_scenes(raw: list[dict]) -> list[Scene]:
    scenes = []
    for index, item in enumerate(raw, start=1):
        scenes.append(Scene.model_validate(_normalise_scene_dict(item, index)))
    return renumber_scenes(scenes)


def _timestamp_to_seconds(value: str | None) -> float | None:
    if not value:
        return None
    try:
        clean = value.replace(",", ".")
        h, m, rest = clean.split(":")
        s, ms = rest.split(".") if "." in rest else (rest, "0")
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms[:3].ljust(3, "0")) / 1000
    except (ValueError, AttributeError):
        return None


def _duration_seconds(scene: Scene) -> float | None:
    start = _timestamp_to_seconds(scene.start_time)
    end = _timestamp_to_seconds(scene.end_time)
    if start is None or end is None:
        return None
    return max(0.0, end - start)


def renumber_scenes(scenes: list[Scene]) -> list[Scene]:
    for index, scene in enumerate(scenes, start=1):
        scene.id = index
        scene.status = "pending"
    return scenes


def validate_scenes(scenes: list[Scene]) -> list[str]:
    errors: list[str] = []
    seen_ids: set[int] = set()
    for index, scene in enumerate(scenes):
        prefix = f"Scene index {index}"
        if not scene.id:
            errors.append(f"{prefix}: missing id")
        elif scene.id in seen_ids:
            errors.append(f"{prefix}: duplicate id {scene.id}")
        else:
            seen_ids.add(scene.id)
            prefix = f"Scene {scene.id}"
        if scene.type not in _VALID_SCENE_TYPES:
            errors.append(f"{prefix}: invalid type '{scene.type}'")
        if scene.aspect_ratio not in _VALID_ASPECT_RATIOS:
            errors.append(f"{prefix}: invalid aspect_ratio '{scene.aspect_ratio}'")
        if not scene.description.strip():
            errors.append(f"{prefix}: description is required")
        duration = _duration_seconds(scene)
        if duration is not None and duration > _MAX_SCENE_SECONDS:
            errors.append(f"{prefix}: duration {duration:.2f}s exceeds 5.00s maximum")
    return errors


_SYS_MAPPING = """\
You are a professional explainer-video visual planner.
Convert a script or SRT captions into an editable asset plan.

ASSET TYPES - use exactly these values:
  INFOGRAPHIC - A designed still visual that explains a concept, comparison, process, statistic, or relationship.
  BROLL       - A video clip prompt for live-action, product, environment, screen, abstract, or cinematic supporting footage.

PLANNING RULES:
  Choose INFOGRAPHIC when the viewer needs a visual explanation, diagram, comparison, timeline, labels, data, or conceptual structure.
  Choose BROLL when the line benefits from motion, human action, context footage, atmosphere, workplace/product shots, locations, or cutaway visuals.
  Do not generate final prompts yet. The description must be an editable creative brief, not a full prompt.
  Keep descriptions concrete enough that a later prompt can be written from them.
  Preserve available timestamps. For raw scripts, estimate rough timestamps and set estimated=true.
  Prefer 16:9 unless a scene is clearly a square graphic/comparison.
  HARD TIMING LIMIT: no scene may last more than 5 seconds. Use 2-5 second visual beats.
  If one topic spans longer than 5 seconds, split it into varied consecutive visual beats.
  It is acceptable to leave small breathing gaps between scenes instead of covering every second.
  Do not continue the same visual for more than one scene; vary BROLL/INFOGRAPHIC choices when a topic needs multiple beats.

OUTPUT - return a JSON array only. No commentary. No markdown fences.
Each element must have exactly these fields:
{
  "id": <integer, starting at 1>,
  "type": <"INFOGRAPHIC"|"BROLL">,
  "description": "<editable creative brief for the visual or b-roll>",
  "source_text": "<script/caption lines this scene supports, or null>",
  "text": null,
  "start_time": "<HH:MM:SS,mmm or null>",
  "end_time": "<HH:MM:SS,mmm or null>",
  "estimated": <true|false>,
  "aspect_ratio": <"1:1"|"16:9">,
  "image_count": 1
}"""

_USER_MAPPING_SRT = """\
Mode: SRT - exact timecodes available.

Parsed SRT segments:
{segments_json}

Create the first draft asset plan. Merge tiny adjacent captions when they are part of the same visual idea.
Every returned scene must be 5 seconds or shorter. Split longer topic spans into multiple visual beats with varied scene types and small gaps where useful.
Return JSON array only."""

_USER_MAPPING_SCRIPT = """\
Mode: Raw script - no exact timecodes.

Approximate video duration: {duration} seconds.
{scene_count_line}
Estimate timestamps across the video and set estimated=true.

Script:
{script_text}

Create the first draft asset plan. Every returned scene must be 5 seconds or shorter.
If a topic spans longer than 5 seconds, split it into multiple varied beats and leave small gaps where useful.
Return JSON array only."""

_SYS_CHAT = """\
You are editing an explainer-video asset plan.
Apply the user's requested changes precisely.

VALID ASSET TYPES:
  INFOGRAPHIC
  BROLL

RULES:
  Return the full updated scene list, not a diff.
  Keep scene descriptions as editable creative briefs, not final generation prompts.
  Renumber scenes sequentially starting at 1 after inserts, deletes, merges, or moves.
  Preserve fields the user did not ask to change.
  No scene may last more than 5 seconds. Split longer spans into multiple varied visual beats.

RESPONSE - return one JSON object only:
{
  "reply": "<one sentence confirming the edit>",
  "scenes": [<complete updated scene array>]
}"""

_USER_CHAT = """\
Current scene plan:
{scenes_json}

User request:
{user_message}

Apply the change and return the full updated plan as JSON."""

_SYS_PROMPT_GEN = """\
You are an expert prompt writer for manual visual generation.
Write one copy-ready prompt from the approved scene brief.

RULES:
  Output the prompt string only. No labels, markdown, numbering, or explanations.
  Do not invent claims that are not supported by the source text.
  Keep the prompt self-contained so it can be pasted into a separate generation tool.
  Mention the desired aspect ratio.
  Keep a consistent clean explainer-video style across scenes unless the user provided a different global style.

TYPE-SPECIFIC RULES:
  INFOGRAPHIC: describe layout, visual hierarchy, icons/diagrams/data shapes, composition, color/style direction, and any text that should appear only if the scene brief asks for it.
  BROLL: describe subject, action, setting, camera framing, movement, lighting, mood, realism level, and avoid captions/text overlays unless explicitly requested."""

_USER_PROMPT_GEN = """\
Project style notes:
{global_style}

Scene:
  ID: {scene_id}
  Type: {scene_type}
  Description: {description}
  Source text: {source_text}
  Aspect ratio: {aspect_ratio}

Write the final {scene_type} prompt."""

_SYS_SCORING = """\
You are a visual quality assessor. Return JSON with score and issues only."""

_USER_SCORING = """\
Scene brief:
Type: {scene_type}
Description: {description}
Text: {text}
Background: {background_color}
Style: {style_prompt}

Evaluate the attached image against this brief."""


async def _call_mapping(user_prompt: str) -> list[Scene]:
    logger.info("_call_mapping: sending request to Gemini (%d chars)", len(user_prompt))
    try:
        response = await asyncio.wait_for(
            _get_client().aio.models.generate_content(
                model=MODEL_NAME,
                contents=user_prompt,
                config=_make_config(_SYS_MAPPING, json_mode=True),
            ),
            timeout=_GEMINI_TIMEOUT,
        )
    except asyncio.TimeoutError as exc:
        raise RuntimeError(f"Gemini API timed out after {int(_GEMINI_TIMEOUT)}s") from exc

    if not response.text:
        raise RuntimeError("Gemini returned an empty response")

    raw = _parse_json(response.text)
    scene_list = raw if isinstance(raw, list) else raw.get("scenes", [])
    scenes = _build_scenes(scene_list)
    logger.info("_call_mapping: built %d scenes", len(scenes))
    return scenes


async def generate_mapping(
    segments: list[dict],
    mode: str,
    duration_estimate: Optional[int] = None,
    scene_count_hint: Optional[int] = None,
) -> list[Scene]:
    if mode == "srt":
        user_prompt = _USER_MAPPING_SRT.format(
            segments_json=json.dumps(segments, indent=2),
        )
    else:
        scene_count_line = (
            f"Target scene count: {scene_count_hint} (strict)."
            if scene_count_hint
            else "Choose an appropriate scene count based on content and pacing."
        )
        user_prompt = _USER_MAPPING_SCRIPT.format(
            duration=duration_estimate or "unknown",
            scene_count_line=scene_count_line,
            script_text=segments[0].get("text", "") if segments else "",
        )

    scenes = await _call_mapping(user_prompt)
    errors = validate_scenes(scenes)
    if errors:
        logger.warning("Mapping validation failed; retrying once: %s", errors)
        retry_prompt = (
            f"{user_prompt}\n\n"
            "The previous output failed validation:\n"
            + "\n".join(f"- {error}" for error in errors)
            + "\nReturn a corrected full JSON array. Every scene must be 5 seconds or shorter."
        )
        scenes = await _call_mapping(retry_prompt)
        errors = validate_scenes(scenes)
        if errors:
            raise ValueError(f"Mapping generation produced invalid scenes after retry: {errors}")
    return scenes


async def update_mapping_chat(
    scenes: list[Scene],
    user_message: str,
    _mode: str,
) -> tuple[list[Scene], str]:
    user_prompt = _USER_CHAT.format(
        scenes_json=json.dumps([s.model_dump() for s in scenes], indent=2),
        user_message=user_message,
    )

    try:
        response = await asyncio.wait_for(
            _get_client().aio.models.generate_content(
                model=MODEL_NAME,
                contents=user_prompt,
                config=_make_config(_SYS_CHAT, json_mode=True),
            ),
            timeout=_GEMINI_TIMEOUT,
        )
    except asyncio.TimeoutError as exc:
        raise RuntimeError(f"Gemini API timed out after {int(_GEMINI_TIMEOUT)}s") from exc

    data = _parse_json(response.text or "{}")
    reply = data.get("reply", "Updated the scene plan.")
    updated = _build_scenes(data.get("scenes", []))
    errors = validate_scenes(updated)
    if errors:
        raise ValueError(f"Chat edit produced invalid scenes: {errors}")
    return updated, reply


async def generate_prompt(
    scene: Scene,
    style: StyleConfig | None = None,
    *,
    global_style: str | None = None,
) -> str:
    """
    Craft a copy-ready prompt for a single approved scene.

    The optional style argument is retained for compatibility with old
    generation code, but the new prompt workspace uses global_style.
    """
    style_notes = global_style
    if not style_notes and style is not None:
        style_notes = style.prompt
    if not style_notes:
        style_notes = (
            "Clean, modern explainer-video visuals; crisp composition; consistent "
            "palette; readable subject hierarchy; no unnecessary text overlays."
        )

    user_prompt = _USER_PROMPT_GEN.format(
        global_style=style_notes,
        scene_id=scene.id,
        scene_type=scene.type,
        description=scene.description,
        source_text=scene.source_text or "none",
        aspect_ratio=scene.aspect_ratio,
    )

    try:
        response = await asyncio.wait_for(
            _get_client().aio.models.generate_content(
                model=MODEL_NAME,
                contents=user_prompt,
                config=_make_config(_SYS_PROMPT_GEN, json_mode=False),
            ),
            timeout=_GEMINI_TIMEOUT,
        )
    except asyncio.TimeoutError as exc:
        raise RuntimeError(f"Gemini API timed out after {int(_GEMINI_TIMEOUT)}s") from exc

    return _clean_prompt_text(response.text)


async def generate_prompts(
    scenes: list[Scene],
    *,
    regenerate: bool = False,
    global_style: str | None = None,
) -> list[Scene]:
    updated: list[Scene] = []
    for scene in scenes:
        if regenerate or not scene.prompt:
            scene.prompt = await generate_prompt(scene, global_style=global_style)
        updated.append(scene)
    return updated


async def score_image(
    scene: Scene,
    image_path: str,
    style: StyleConfig,
) -> ScoreResult:
    """
    Legacy scoring support retained so old generation modules still import.
    The current app flow no longer calls this.
    """
    try:
        import PIL.Image as PILImage
    except ImportError as exc:
        raise RuntimeError("Pillow is required for image scoring: pip install Pillow") from exc

    path = Path(image_path)
    if not path.exists():
        return ScoreResult(score=0.0, issues=["Image file not found"], hard_fail=True)

    try:
        image = PILImage.open(path)
    except Exception as exc:
        return ScoreResult(score=0.0, issues=[f"Cannot open image: {exc}"], hard_fail=True)

    user_prompt = _USER_SCORING.format(
        scene_type=scene.type,
        description=scene.description,
        text=scene.text or "none required",
        background_color=style.background_color,
        style_prompt=style.prompt,
    )

    response = await _get_client().aio.models.generate_content(
        model=MODEL_NAME,
        contents=[user_prompt, image],
        config=_make_config(_SYS_SCORING, json_mode=True),
    )

    try:
        data = _parse_json(response.text or "{}")
        score = max(0.0, min(10.0, float(data["score"])))
        issues = [str(issue) for issue in data.get("issues", [])]
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return ScoreResult(score=0.0, issues=["Scoring response parse error"], hard_fail=True)

    hard_fail_signals = {
        "wrong text",
        "missing text",
        "blank",
        "wrong subject",
        "wrong background",
        "incorrect text",
        "no text",
    }
    hard_fail = any(
        any(signal in issue.lower() for signal in hard_fail_signals)
        for issue in issues
    ) or score == 0.0
    return ScoreResult(score=score, issues=issues, hard_fail=hard_fail)
