"""
Async generation engine.

Entry points:
    await run_generation(session_id, batch_size)
    await resume_generation(session_id, mode)
    await regenerate_scenes(session_id, scene_ids, instructions)

Pipeline per scene:
    can_generate? → set "generating" → per-image retry loop
    → mark "completed" / "needs_review" → pause or continue

Concurrency:
    Scenes within a batch run concurrently, capped at _MAX_WORKERS via semaphore.
    Batches run sequentially; the pipeline stops between batches if
    stop_requested or paused_for_review is set.
"""

import asyncio
import logging
import re
from pathlib import Path

from backend import image_service, llm_service, scorer
from backend.generation_control import can_generate
from backend.schemas import Scene, StyleConfig
from backend.session_store import store

logger = logging.getLogger(__name__)

_MAX_ATTEMPTS = 2
_MAX_WORKERS = 3
_OUTPUTS_DIR = Path("outputs")


# ---------------------------------------------------------------------------
# Style validation
# ---------------------------------------------------------------------------

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _validate_style(session) -> str | None:
    """
    Validate session.style before generation begins.

    Returns an error string if invalid, None if valid.
    Checks:
      - style is set
      - prompt is a non-empty string
      - background_color is a non-empty string in #RRGGBB hex format
    """
    style = session.style
    if style is None:
        return "No style selected"
    if not style.prompt or not style.prompt.strip():
        return "Style prompt is empty"
    if not style.background_color or not style.background_color.strip():
        return "Style background_color is missing"
    if not _HEX_RE.match(style.background_color.strip()):
        return f"Style background_color is not a valid hex colour: '{style.background_color}'"
    return None


# ---------------------------------------------------------------------------
# Session state helpers  (always called inside with_lock)
# ---------------------------------------------------------------------------

def _sync_completed_scenes(session) -> None:
    """Derive completed_scenes by counting — never increment/decrement manually."""
    session.completed_scenes = sum(
        1 for sc in session.scenes if sc.status == "completed"
    )


def _sync_session_status(session) -> None:
    """
    Derive session.status from scene states and control flags.

    Priority order:
        1. stop_requested  → "stopped"
        2. paused_for_review → "paused"
        3. all scenes in a terminal state (completed + failed == total) → "completed"
        4. otherwise → "running"

    Never call session.status = ... directly anywhere else.
    """
    total = len(session.scenes)
    completed = sum(sc.status == "completed" for sc in session.scenes)
    failed = sum(sc.status == "failed" for sc in session.scenes)

    if session.stop_requested:
        session.status = "stopped"
    elif session.paused_for_review:
        session.status = "paused"
    elif total > 0 and completed + failed == total:
        session.status = "completed"
    else:
        session.status = "running"


def _compute_current_index(session) -> int:
    """
    Return the list index of the first scene that is not yet terminal.

    Terminal statuses: "completed", "failed".
    Returns len(session.scenes) when every scene has reached a terminal state.
    """
    for i, sc in enumerate(session.scenes):
        if sc.status not in ("completed", "failed"):
            return i
    return len(session.scenes)


async def _mark_scene_generating(session_id: str, scene_id: int) -> None:
    async def _fn():
        session = store.get(session_id)
        if session is None:
            return
        for sc in session.scenes:
            if sc.id == scene_id:
                sc.status = "generating"
                break
        store.update(session)
        await store.persist(session)

    await store.with_lock(session_id, _fn)


async def _record_attempt(
    session_id: str,
    scene_id: int,
    attempt: int,
    score: float | None,
    image_path: str | None,
    error: str | None = None,
) -> None:
    async def _fn():
        session = store.get(session_id)
        if session is None:
            return
        for sc in session.scenes:
            if sc.id == scene_id:
                sc.attempts = attempt + 1
                sc.total_attempts += 1
                if score is not None:
                    sc.score = score
                # None entries mark generation failures; valid paths mark real outputs.
                # Both are appended so image_paths length always equals attempts.
                sc.image_paths.append(image_path)
                if error:
                    sc.last_error = error
                break
        store.update(session)
        await store.persist(session)

    await store.with_lock(session_id, _fn)


async def _cache_prompt(session_id: str, scene_id: int, prompt: str) -> None:
    async def _fn():
        session = store.get(session_id)
        if session is None:
            return
        for sc in session.scenes:
            if sc.id == scene_id:
                sc.cached_prompt = prompt
                break
        store.update(session)
        await store.persist(session)

    await store.with_lock(session_id, _fn)


async def _advance_image_index(session_id: str, scene_id: int) -> None:
    async def _fn():
        session = store.get(session_id)
        if session is None:
            return
        for sc in session.scenes:
            if sc.id == scene_id:
                sc.current_image_index += 1
                break
        store.update(session)
        await store.persist(session)

    await store.with_lock(session_id, _fn)


async def _mark_scene_completed(session_id: str, scene_id: int) -> None:
    async def _fn():
        session = store.get(session_id)
        if session is None:
            return
        for sc in session.scenes:
            if sc.id == scene_id:
                sc.status = "completed"
                break
        _sync_completed_scenes(session)
        session.current_index = _compute_current_index(session)
        _sync_session_status(session)
        store.update(session)
        await store.persist(session)

    await store.with_lock(session_id, _fn)


async def _mark_scene_failed(session_id: str, scene_id: int) -> None:
    async def _fn():
        session = store.get(session_id)
        if session is None:
            return
        for sc in session.scenes:
            if sc.id == scene_id:
                sc.status = "failed"
                sc.needs_user_review = False
                sc.current_image_index = sc.image_count  # mark fully exhausted
                break
        if scene_id not in session.failed_scenes:
            session.failed_scenes.append(scene_id)
        _sync_completed_scenes(session)
        session.current_index = _compute_current_index(session)
        _sync_session_status(session)
        store.update(session)
        await store.persist(session)

    await store.with_lock(session_id, _fn)


async def _mark_scene_needs_review(session_id: str, scene_id: int) -> None:
    async def _fn():
        session = store.get(session_id)
        if session is None:
            return
        for sc in session.scenes:
            if sc.id == scene_id:
                sc.status = "needs_review"
                sc.needs_user_review = True
                break
        session.paused_for_review = True
        _sync_session_status(session)
        store.update(session)
        await store.persist(session)

    await store.with_lock(session_id, _fn)


async def _add_failed_scene(session_id: str, scene_id: int) -> None:
    async def _fn():
        session = store.get(session_id)
        if session is None:
            return
        if scene_id not in session.failed_scenes:
            session.failed_scenes.append(scene_id)
        store.update(session)
        await store.persist(session)

    await store.with_lock(session_id, _fn)


# ---------------------------------------------------------------------------
# Per-image retry loop
# ---------------------------------------------------------------------------

async def _process_image(
    session_id: str,
    scene: Scene,
    img_index: int,
    style: StyleConfig,
) -> bool:
    """
    Attempt to generate and score a single image up to _MAX_ATTEMPTS times.

    Each attempt:
        1. Use scene.cached_prompt if available; otherwise generate once and cache.
           Regeneration instructions cause cached_prompt to be cleared before this
           call (in regenerate_scenes), so a fresh prompt is produced automatically.
        2. Call image_service to produce a PNG.
           On failure: record None in image_paths, store error, skip scoring.
        3. Score via scorer only when a real file was produced.
        4. image_paths grows by exactly one entry per attempt (None or a path).

    Returns True if a passing image was produced, False if all attempts fail.
    """
    # Generate prompt once per scene; reuse on retries
    prompt = scene.cached_prompt
    if not prompt:
        try:
            prompt = await llm_service.generate_prompt(scene, style)
            await _cache_prompt(session_id, scene.id, prompt)
        except Exception as exc:
            error_msg = f"Prompt generation error: {exc}"
            logger.error("Scene %d | image %d → %s", scene.id, img_index, error_msg)
            # Record one failure entry and bail — all attempts blocked without a prompt
            await _record_attempt(
                session_id, scene.id, 0,
                score=None, image_path=None, error=error_msg,
            )
            return False

    for attempt in range(_MAX_ATTEMPTS):
        # Respect a stop signal that arrived mid-retry loop
        session = store.get(session_id)
        if session is not None and session.stop_requested:
            logger.info(
                "Scene %d | image %d | attempt %d — stop_requested, aborting",
                scene.id, img_index, attempt + 1,
            )
            return False

        # Guard against infinite retries across multiple resumes
        if scene.total_attempts >= scene.max_attempts_total:
            logger.error(
                "Scene %d | image %d → total_attempts %d reached max %d, marking failed",
                scene.id, img_index, scene.total_attempts, scene.max_attempts_total,
            )
            await _mark_scene_failed(session_id, scene.id)
            return False

        try:
            image_path = await image_service.generate_image(prompt, scene.aspect_ratio)
        except Exception as exc:
            error_msg = str(exc)
            logger.error(
                "Scene %d | image %d | attempt %d → image generation error: %s",
                scene.id, img_index, attempt + 1, error_msg,
            )
            # Generation failed — no file exists; do NOT call scorer
            await _record_attempt(
                session_id, scene.id, attempt,
                score=None, image_path=None, error=error_msg,
            )
            continue

        # File exists — score it; treat any scorer exception as a fail attempt
        try:
            passed, score, issues = await scorer.score_image(scene, image_path, style)
        except Exception as exc:
            error_msg = f"Scoring error: {exc}"
            logger.error(
                "Scene %d | image %d | attempt %d → %s",
                scene.id, img_index, attempt + 1, error_msg,
            )
            await _record_attempt(
                session_id, scene.id, attempt,
                score=None, image_path=image_path, error=error_msg,
            )
            continue

        await _record_attempt(
            session_id, scene.id, attempt,
            score=score, image_path=image_path,
        )

        # scorer.py is the sole pass/fail authority — trust its boolean directly
        if passed:
            logger.info(
                "Scene %d | image %d | attempt %d → PASS (score=%.2f)",
                scene.id, img_index, attempt + 1, score,
            )
            return True

        logger.warning(
            "Scene %d | image %d | attempt %d → FAIL (score=%.2f) issues=%s",
            scene.id, img_index, attempt + 1, score, issues,
        )

    return False


# ---------------------------------------------------------------------------
# Per-scene processor
# ---------------------------------------------------------------------------

async def _process_scene(
    semaphore: asyncio.Semaphore,
    session_id: str,
    scene: Scene,
    abort_event: asyncio.Event,
) -> None:
    """
    Acquire the concurrency semaphore, then generate all images for one scene.

    abort_event is a per-batch signal. Any scene that triggers paused_for_review
    sets it, causing all sibling tasks to exit at their next checkpoint and the
    batch watcher in run_generation to cancel any still-running tasks immediately.
    """
    # Fast exit before competing for the semaphore — avoids blocking a worker
    # slot on a scene that will never run anyway.
    session = store.get(session_id)
    if session is not None and session.stop_requested:
        logger.info("Scene %d skipped — stop_requested before semaphore", scene.id)
        return

    async with semaphore:
        # Exit immediately if abort was already signalled before we got the lock
        if abort_event.is_set():
            return

        # Re-read live session state inside the semaphore
        session = store.get(session_id)
        if session is None:
            return
        if not can_generate(scene, session):
            logger.debug("Scene %d skipped (can_generate=False)", scene.id)
            return

        style = session.style
        if style is None:
            logger.error("Scene %d skipped — session has no style configured", scene.id)
            return

        await _mark_scene_generating(session_id, scene.id)

        # Resume from the last recorded image index (0 on a fresh scene)
        start_index = scene.current_image_index
        logger.info(
            "Scene %d → generating (%d image(s), starting at index %d)",
            scene.id, scene.image_count, start_index,
        )

        all_passed = True

        for img_index in range(start_index, scene.image_count):
            # stop_requested is a global flag — checked independently of abort_event
            session = store.get(session_id)
            if session is None or session.stop_requested:
                logger.info("Scene %d | image %d — stop_requested, exiting", scene.id, img_index)
                return
            # abort_event / paused_for_review are per-batch pause signals
            if abort_event.is_set() or session.paused_for_review:
                logger.info("Scene %d | image %d — paused, exiting", scene.id, img_index)
                return

            passed = await _process_image(session_id, scene, img_index, style)
            await _advance_image_index(session_id, scene.id)

            if not passed:
                all_passed = False
                logger.error(
                    "Scene %d | image %d failed all %d attempts → pausing for review",
                    scene.id, img_index, _MAX_ATTEMPTS,
                )
                await _mark_scene_needs_review(session_id, scene.id)
                await _add_failed_scene(session_id, scene.id)
                abort_event.set()  # signal all sibling tasks to stop ASAP
                return

        if all_passed:
            await _mark_scene_completed(session_id, scene.id)
            logger.info("Scene %d → completed", scene.id)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def run_generation(
    session_id: str,
    batch_size: int = 1,
    *,
    _is_resume: bool = False,
) -> None:
    """
    Run the full image generation pipeline for a session.

    Args:
        session_id:  ID of an approved session (must already exist in store).
        batch_size:  Number of scenes to dispatch per batch (1 / 5 / 10).
                     Within each batch, up to _MAX_WORKERS scenes run concurrently.
        _is_resume:  Internal flag. Set True when called from resume_generation or
                     regenerate_scenes — those callers already cleared stop/pause
                     flags in their own _prepare() step, so _init() must not
                     overwrite a stop signal that arrived in the narrow window
                     between _prepare() and _init().

    Behaviour:
        - Clears stop_requested / paused_for_review only on a fresh start
          (_is_resume=False).
        - Skips scenes that don't pass can_generate().
        - Pauses the entire pipeline if any scene hits paused_for_review.
        - Exits immediately if stop_requested is set.
        - Derives session.status via _sync_session_status on finalise.
    """
    session = store.get(session_id)
    if session is None:
        raise ValueError(f"Session '{session_id}' not found in store")

    # Validate style before touching any state
    style_error = _validate_style(session)
    if style_error:
        async def _set_error():
            s = store.get(session_id)
            if s is None:
                return
            s.last_error = style_error
            s.stop_requested = True
            _sync_session_status(s)
            store.update(s)
            await store.persist(s)
        await store.with_lock(session_id, _set_error)
        logger.error("Generation aborted — style invalid: %s", style_error)
        return

    # Initialise run state
    async def _init():
        s = store.get(session_id)
        if s is None:
            return
        # Only a fresh /generate call may clear these flags.
        # resume_generation and regenerate_scenes clear them in _prepare(),
        # and must not have that cleared if a /stop arrived between _prepare and _init.
        if not _is_resume:
            s.stop_requested = False
            s.paused_for_review = False
        s.last_error = None
        s.total_scenes = len(s.scenes)
        _sync_completed_scenes(s)
        s.current_index = _compute_current_index(s)
        _sync_session_status(s)
        store.update(s)
        await store.persist(s)

    await store.with_lock(session_id, _init)

    semaphore = asyncio.Semaphore(_MAX_WORKERS)
    scenes = store.get(session_id).scenes  # snapshot of scene list

    # Process in batches
    for batch_start in range(0, len(scenes), batch_size):
        batch = scenes[batch_start : batch_start + batch_size]

        # Gate check before each batch
        session = store.get(session_id)
        if session is None:
            break
        if session.stop_requested:
            logger.info("Generation stopped before batch starting at index %d", batch_start)
            break
        if session.paused_for_review:
            logger.info("Generation paused for review before batch starting at index %d", batch_start)
            break

        logger.info(
            "Batch %d–%d | dispatching %d scene(s)",
            batch_start + 1,
            batch_start + len(batch),
            len(batch),
        )

        # Fresh abort event for this batch — set by any scene that triggers pause
        abort_event = asyncio.Event()

        tasks = [
            asyncio.create_task(
                _process_scene(semaphore, session_id, scene, abort_event)
            )
            for scene in batch
        ]

        # Race: wait for all tasks OR for the abort signal, whichever comes first
        abort_watcher = asyncio.create_task(abort_event.wait())
        done, pending = await asyncio.wait(
            {abort_watcher, *tasks},
            return_when=asyncio.FIRST_COMPLETED,
        )

        if abort_watcher in done and pending:
            # Abort fired — cancel every task that hasn't finished yet
            logger.info(
                "Abort triggered mid-batch — cancelling %d task(s)", len(pending)
            )
            for t in pending:
                t.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
        else:
            # All tasks finished normally; clean up the watcher
            abort_watcher.cancel()
            await asyncio.gather(abort_watcher, return_exceptions=True)

        # Post-batch gate — stop and pause are independent, checked separately
        session = store.get(session_id)
        if session is None:
            break
        if session.stop_requested:
            logger.info("Generation stopped after batch — stop_requested")
            break
        if session.paused_for_review:
            logger.info("Generation paused after batch — paused_for_review")
            break

    # Finalise status
    async def _finalise():
        s = store.get(session_id)
        if s is None:
            return
        _sync_session_status(s)
        store.update(s)
        await store.persist(s)

    await store.with_lock(session_id, _finalise)

    final = store.get(session_id)
    if final:
        logger.info(
            "Generation finished | session=%s | status=%s | completed=%d/%d | failed=%s",
            session_id,
            final.status,
            final.completed_scenes,
            final.total_scenes,
            final.failed_scenes,
        )


# ---------------------------------------------------------------------------
# Stop
# ---------------------------------------------------------------------------

async def stop_generation(session_id: str) -> None:
    """
    Signal an in-progress generation run to halt at the next scene boundary.

    Only stop_requested is touched — no scene state, no paused_for_review,
    no counters. The running pipeline polls this flag before every image and
    between every batch, so the effect is near-immediate.
    """
    async def _fn():
        s = store.get(session_id)
        if s is None:
            return
        s.stop_requested = True
        _sync_session_status(s)
        store.update(s)
        await store.persist(s)

    await store.with_lock(session_id, _fn)
    logger.info("Stop requested | session=%s", session_id)


# ---------------------------------------------------------------------------
# Resume
# ---------------------------------------------------------------------------

async def resume_generation(
    session_id: str,
    mode: str,
    batch_size: int = 1,
) -> None:
    """
    Resume a stopped or paused generation run.

    Args:
        session_id: Existing session in the store.
        mode:
            "from_start"   — Reset every scene (including completed ones) back to
                             pending, reset counters, and re-run the full pipeline.
            "from_current" — Clear stop/pause flags only; completed scenes remain
                             completed and can_generate() skips them naturally.
        batch_size: Forwarded to run_generation.

    Raises:
        ValueError: Unknown mode or missing session.
    """
    if store.get(session_id) is None:
        raise ValueError(f"Session '{session_id}' not found in store")

    if mode not in ("from_start", "from_current"):
        raise ValueError(f"Invalid resume mode '{mode}'. Expected 'from_start' or 'from_current'")

    async def _prepare():
        s = store.get(session_id)
        if s is None:
            return
        s.stop_requested = False
        s.paused_for_review = False
        s.last_error = None

        if mode == "from_start":
            for sc in s.scenes:
                sc.status = "pending"
                sc.attempts = 0
                sc.total_attempts = 0
                sc.score = None
                sc.needs_user_review = False
                sc.image_paths = []
                sc.current_image_index = 0
                sc.cached_prompt = None
            s.failed_scenes = []
        else:
            # from_current: scenes stuck mid-way in "generating" are reset to
            # pending so they re-enter the loop from their saved image index.
            # completed scenes are untouched — can_generate() will skip them.
            for sc in s.scenes:
                if sc.status == "generating":
                    sc.status = "pending"

        _sync_completed_scenes(s)
        s.current_index = _compute_current_index(s)
        _sync_session_status(s)

        store.update(s)
        await store.persist(s)

    await store.with_lock(session_id, _prepare)
    logger.info("Resuming generation | session=%s | mode=%s", session_id, mode)
    await run_generation(session_id, batch_size=batch_size, _is_resume=True)


# ---------------------------------------------------------------------------
# Selective regeneration
# ---------------------------------------------------------------------------

async def regenerate_scenes(
    session_id: str,
    scene_ids: list[int],
    instructions: str | None = None,
    batch_size: int = 1,
) -> None:
    """
    Reset and re-run specific scenes after a completed (or stopped) run.

    Completed scenes outside scene_ids are untouched.
    Failed and needs_review scenes inside scene_ids are reset to pending.

    Args:
        session_id:   Existing session in the store.
        scene_ids:    IDs of scenes to regenerate.
        instructions: Optional text appended to each targeted scene's description
                      (e.g. "simpler visuals", "more contrast"). If None, the
                      original description is preserved.
        batch_size:   Forwarded to run_generation.
    """
    if store.get(session_id) is None:
        raise ValueError(f"Session '{session_id}' not found in store")

    target_set = set(scene_ids)

    async def _prepare():
        s = store.get(session_id)
        if s is None:
            return

        for sc in s.scenes:
            if sc.id not in target_set:
                continue
            sc.status = "pending"
            sc.attempts = 0
            sc.total_attempts = 0
            sc.score = None
            sc.needs_user_review = False
            sc.image_paths = []
            sc.current_image_index = 0
            sc.cached_prompt = None  # always regenerate prompt on explicit regeneration
            if instructions:
                sc.description = f"{sc.description} [{instructions}]"

        # Remove targeted scenes from the failed list; they're getting another chance
        s.failed_scenes = [fid for fid in s.failed_scenes if fid not in target_set]

        _sync_completed_scenes(s)
        s.current_index = _compute_current_index(s)

        s.stop_requested = False
        s.paused_for_review = False
        s.last_error = None

        _sync_session_status(s)

        store.update(s)
        await store.persist(s)

    await store.with_lock(session_id, _prepare)
    logger.info(
        "Regenerating scenes | session=%s | scene_ids=%s | instructions=%r",
        session_id, scene_ids, instructions,
    )
    await run_generation(session_id, batch_size=batch_size, _is_resume=True)
