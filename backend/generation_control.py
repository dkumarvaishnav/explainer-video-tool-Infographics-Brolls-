"""
Generation control — gate checks used by the generation engine.
"""

from backend.schemas import Scene, Session


def can_generate(scene: Scene, session: Session) -> bool:
    """
    Return True if the scene is eligible for (re)generation.

    A scene is blocked when:
      - The user has requested a stop (stop_requested)
      - The pipeline is paused awaiting user review (paused_for_review)
      - The scene has already completed successfully (status == "completed")
    """
    if session.stop_requested:
        return False
    if session.paused_for_review:
        return False
    if scene.status == "completed":
        return False
    if scene.status == "failed":
        return False
    return True
