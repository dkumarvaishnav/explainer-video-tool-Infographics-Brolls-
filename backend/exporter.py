"""
Export pipeline — package approved images and generate reference.txt.

Public function:
    export_project(session, project_name) -> output folder path (str)
"""

import shutil
from pathlib import Path

from backend.schemas import Scene, Session
from backend.utils import get_filename

_OUTPUTS_DIR = Path("outputs")


def _format_timestamp(scene: Scene) -> str:
    """Build a human-readable time range string for the reference doc."""
    if scene.start_time and scene.end_time:
        marker = " (est.)" if scene.estimated else ""
        return f"{scene.start_time} → {scene.end_time}{marker}"
    return "unknown"


def _scene_block(scene: Scene, exported_filenames: list[str]) -> str:
    """Render one scene entry for reference.txt."""
    lines = [
        f"Scene {scene.id:02d}",
        f"Time: {_format_timestamp(scene)}",
        f"Type: {scene.type}",
        f"Files: {', '.join(exported_filenames) if exported_filenames else 'none'}",
        f"Description: {scene.description}",
    ]
    if scene.text:
        lines.append(f"Text: {scene.text}")
    return "\n".join(lines)


def _find_valid_image(image_paths: list) -> str | None:
    """
    Return the most recent valid image path, iterating in reverse.
    A valid path is non-None and points to an existing file on disk.
    Returns None if no valid path is found.
    """
    for path in reversed(image_paths):
        if path is not None and Path(path).exists():
            return path
    return None


def export_project(session: Session, project_name: str | None = None) -> str:
    """
    Copy completed scene images to outputs/{project_name}/ and write reference.txt.

    Args:
        session:      Completed (or partially completed) Session object.
        project_name: Optional prefix for filenames and the output folder name.
                      Falls back to session.session_id when not provided.

    Returns:
        Absolute path string of the output folder.

    Behaviour:
        - Only scenes with status="completed" are exported.
        - For each completed scene, image_paths is searched in reverse for the
          first non-None path that exists on disk. Earlier None entries (failed
          generation attempts) are ignored.
        - If no valid file is found for a completed scene, it is treated as
          failed and listed in the FAILED SCENES block — no crash, no copy.
        - Failed/needs_review scenes are skipped but listed at the end of
          reference.txt.
        - The output folder is created if it does not exist.
    """
    folder_name = project_name or session.session_id
    output_dir = _OUTPUTS_DIR / folder_name
    output_dir.mkdir(parents=True, exist_ok=True)

    ref_blocks: list[str] = []
    failed_ids: list[int] = []

    for scene in session.scenes:
        if scene.status != "completed":
            if scene.status in ("failed", "needs_review"):
                failed_ids.append(scene.id)
            continue

        accepted_src = _find_valid_image(scene.image_paths)
        exported_filenames: list[str] = []

        if accepted_src is None:
            # Completed status but no valid file on disk — treat as failed
            failed_ids.append(scene.id)
            ref_blocks.append(_scene_block(scene, []))
            continue

        dest_filename = get_filename(
            scene.id,
            index=0 if scene.image_count > 1 else None,
            project_name=project_name,
        )
        dest = output_dir / dest_filename
        shutil.copy2(accepted_src, dest)
        exported_filenames.append(dest_filename)

        ref_blocks.append(_scene_block(scene, exported_filenames))

    # Build reference.txt
    ref_lines = ["\n---\n\n".join(ref_blocks)]

    if failed_ids:
        ref_lines.append(
            "\n---\n\nFAILED SCENES: " + ", ".join(str(i) for i in sorted(failed_ids))
        )

    reference_path = output_dir / "reference.txt"
    reference_path.write_text("\n".join(ref_lines), encoding="utf-8")

    return str(output_dir.resolve())
