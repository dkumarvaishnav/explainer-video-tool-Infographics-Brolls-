"""
Shared utilities.
"""


def get_filename(
    scene_id: int,
    index: int | None = None,
    project_name: str | None = None,
) -> str:
    """
    Build the output filename for a generated scene image.

    Args:
        scene_id:     Scene number (zero-padded to 2 digits).
        index:        Image index within a multi-image scene (0-based).
                      0 → 'a', 1 → 'b', etc.
                      Omit for single-image scenes.
        project_name: Optional project prefix.

    Examples:
        get_filename(1)              → "scene_01.png"
        get_filename(1, index=0)     → "scene_01a.png"
        get_filename(1, index=0,
            project_name="project") → "project_scene_01a.png"
    """
    base = f"scene_{scene_id:02d}"

    if index is not None:
        base = f"{base}{chr(97 + index)}"

    if project_name:
        base = f"{project_name}_{base}"

    return f"{base}.png"
