from datetime import datetime, timezone

from pydantic import BaseModel, Field
from typing import List, Optional, Literal

# ---------------------------------------------------------------------------
# Core domain types
# ---------------------------------------------------------------------------

SceneType = Literal["INFOGRAPHIC", "BROLL"]
AspectRatio = Literal["1:1", "16:9"]


class Scene(BaseModel):
    id: int
    type: SceneType
    description: str
    source_text: Optional[str] = None
    text: Optional[str] = None

    start_time: Optional[str] = None
    end_time: Optional[str] = None
    estimated: bool = False

    aspect_ratio: AspectRatio = "1:1"
    image_count: int = 1

    status: Literal["pending", "generating", "completed", "failed", "needs_review"] = "pending"

    image_paths: List[Optional[str]] = Field(default_factory=list)
    attempts: int = 0
    score: Optional[float] = None

    generation_locked: bool = False
    needs_user_review: bool = False
    variant_group: Optional[str] = None
    current_image_index: int = 0
    cached_prompt: Optional[str] = None
    prompt: Optional[str] = None
    total_attempts: int = 0
    max_attempts_total: int = 6


class StyleConfig(BaseModel):
    name: str
    prompt: str
    reference_image: Optional[str] = None
    background_color: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str


class Session(BaseModel):
    session_id: str
    mode: Literal["srt", "script"]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    raw_input: str
    project_name: Optional[str] = None
    duration_estimate: Optional[int] = None  # seconds
    scene_count_hint: Optional[int] = None

    scenes: List[Scene] = Field(default_factory=list)
    chat_history: List[ChatMessage] = Field(default_factory=list)
    approved: bool = False

    style: Optional[StyleConfig] = None

    current_index: int = 0
    status: Literal["idle", "running", "paused", "stopped", "completed"] = "idle"

    failed_scenes: List[int] = Field(default_factory=list)

    total_scenes: int = 0
    completed_scenes: int = 0
    stop_requested: bool = False
    paused_for_review: bool = False
    last_error: Optional[str] = None


# ---------------------------------------------------------------------------
# Request bodies (one per endpoint)
# ---------------------------------------------------------------------------

class UploadRequest(BaseModel):
    mode: Literal["srt", "script"]
    content: str
    duration_estimate: Optional[int] = None  # required for mode=script, seconds
    project_name: Optional[str] = None
    scene_count_hint: Optional[int] = None


class GenerateMappingRequest(BaseModel):
    session_id: str


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ApproveMappingRequest(BaseModel):
    session_id: str


class GenerateRequest(BaseModel):
    session_id: str
    batch_size: Literal[1, 5, 10] = 1


class UpdateScenesRequest(BaseModel):
    session_id: str
    scenes: List[Scene]


class GeneratePromptsRequest(BaseModel):
    session_id: str
    regenerate: bool = False
    global_style: Optional[str] = None


class StopRequest(BaseModel):
    session_id: str


class ResumeRequest(BaseModel):
    session_id: str
    mode: Literal["from_start", "from_current"]


class RegenerateRequest(BaseModel):
    session_id: str
    scene_ids: List[int]
    instructions: Optional[str] = None


class SetStyleRequest(BaseModel):
    session_id: str
    name: str
    prompt: str
    background_color: str
    reference_image: Optional[str] = None


class ExportRequest(BaseModel):
    session_id: str
    project_name: Optional[str] = None
    file_name: Optional[str] = None
    format: Literal["scene_list", "separated"] = "scene_list"


# ---------------------------------------------------------------------------
# Response envelopes
# ---------------------------------------------------------------------------

class SessionResponse(BaseModel):
    session_id: str
    status: str


class SessionSummary(BaseModel):
    session_id: str
    project_name: Optional[str]
    mode: str
    phase: Literal["upload", "mapping", "prompts"]
    approved: bool
    scene_count: int
    prompt_count: int
    created_at: datetime
    updated_at: datetime


class SessionListResponse(BaseModel):
    sessions: List[SessionSummary]


class SessionDetailResponse(BaseModel):
    session: Session


class StatusResponse(BaseModel):
    session_id: str
    status: str
    current_scene: int
    total_scenes: int
    completed_scenes: int
    failed_scenes: List[int]
    paused_for_review: bool
    scenes: List[Scene]


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    scenes: List[Scene]


class PromptResponse(BaseModel):
    session_id: str
    reply: str
    scenes: List[Scene]


class ExportResponse(BaseModel):
    session_id: str
    output_path: str
    reference_doc: str
