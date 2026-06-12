# ENGINEERING SPEC — Infographic Automation Tool (V1.3)

## Purpose

This document translates the PRD into **implementation-ready specifications**.
It defines:

* Data models
* API contracts
* Prompt system
* Generation pipeline
* System behavior rules

This is the **source of truth for development**.

---

# 1. System Overview

## Pipeline

```
Input → Parsing → Mapping (LLM)
→ Chat Review → Approval
→ Style Selection
→ Generation Engine
    → Prompt → Image → Score → Retry
→ Export
```

---

# 2. Core System Rules

## 2.1 Scene Rules

* Scene count:

  * User-defined → strict
  * Else → LLM decides
* Scene types (fixed in V1):

  * INFOGRAPHIC
  * TITLE
  * DESCRIPTOR
  * HYBRID
* Granularity: balanced

---

## 2.2 Multi-Image Scenes

* Supported
* Naming:

  * `scene_01a.png`
  * `scene_01b.png`

---

## 2.3 Aspect Ratio Logic

LLM assigns aspect ratio using rules:

| Condition                | Aspect Ratio |
| ------------------------ | ------------ |
| Comparison / split logic | 1:1          |
| Text scenes              | 1:1          |
| Full explanation         | 16:9         |

---

## 2.4 Background System

* User selects:

  * Preset color OR hex code
* Enforced:

  * Prompt-level constraint
  * Post-validation check
* Must be:

  * Solid color
  * No gradients
  * Chroma-safe

---

## 2.5 Editing Rules

* No mid-generation editing
* Allowed:

  * Stop generation
  * Resume:

    * from start
    * from current
* After completion:

  * Regenerate specific scenes

---

## 2.6 Failure Handling

* Retry max: 3
* If 2 failures:

  * show both outputs
  * wait for user input
* If final fail:

  * mark scene as failed
  * continue pipeline

---

## 2.7 Scoring Rules

* Threshold: 7.5
* Hidden from UI
* Hard fail conditions:

  * Wrong text
  * Blank image
  * Wrong subject
  * Wrong background

---

# 3. Data Models

## `schemas.py`

```python
from pydantic import BaseModel
from typing import List, Optional, Literal

SceneType = Literal["INFOGRAPHIC", "TITLE", "DESCRIPTOR", "HYBRID"]
AspectRatio = Literal["1:1", "16:9"]

class Scene(BaseModel):
    id: int
    type: SceneType
    description: str
    text: Optional[str]

    start_time: Optional[str]
    end_time: Optional[str]
    estimated: bool

    aspect_ratio: AspectRatio
    image_count: int

    status: Literal[
        "pending", "generating", "completed", "failed", "needs_review"
    ]

    image_paths: List[str]
    attempts: int
    score: Optional[float]


class StyleConfig(BaseModel):
    name: str
    prompt: str
    reference_image: Optional[str]
    background_color: str


class Session(BaseModel):
    session_id: str
    mode: Literal["srt", "script"]

    raw_input: str
    duration_estimate: Optional[int]

    scenes: List[Scene]
    approved: bool

    style: Optional[StyleConfig]

    current_index: int
    status: Literal["idle", "running", "stopped", "completed"]

    failed_scenes: List[int]
```

---

# 4. API Contracts

## 4.1 Upload

```
POST /upload
```

```json
{
  "mode": "srt",
  "content": "...",
  "duration_estimate": 120
}
```

---

## 4.2 Generate Mapping

```
POST /generate-mapping
```

---

## 4.3 Chat Edit

```
POST /chat
```

---

## 4.4 Approve Mapping

```
POST /approve-mapping
```

---

## 4.5 Start Generation

```
POST /generate
```

```json
{
  "batch_size": 5
}
```

---

## 4.6 Stop

```
POST /stop
```

---

## 4.7 Resume

```
POST /resume
```

```json
{
  "mode": "from_start" | "from_current"
}
```

---

## 4.8 Regenerate Scenes

```
POST /regenerate-scenes
```

```json
{
  "scene_ids": [4,5,7],
  "instructions": "simpler visuals"
}
```

---

## 4.9 Status

```
GET /status
```

---

## 4.10 Export

```
POST /export
```

---

# 5. Prompt System

## 5.1 Mapping Prompt

```
You are a professional video visual planner.

Convert the script into structured scenes.

Rules:
- Balanced granularity
- Use valid scene types
- Assign aspect ratio using rules:
  - comparison → 1:1
  - explanation → 16:9
- Scenes may contain multiple images

Return JSON only.
```

---

## 5.2 Image Prompt Template

```
[STYLE PROMPT]

Create a {scene_type} visual.

Content:
{description}

Text:
{text}

STRICT:
- Solid {background_color}
- No gradients
- Clean chroma separation

Aspect ratio: {aspect_ratio}
```

---

## 5.3 Scoring Prompt

```
Evaluate this image.

Check:
- matches description
- correct style
- correct background
- text accuracy

Return JSON:
{
  "score": number,
  "issues": []
}
```

---

## 5.4 Regeneration Prompt

```
Fix issues:
{issues}

Improve output.
Do not repeat mistakes.
```

---

# 6. Generation Engine

## Logic

```
for scene:
    for each image:
        generate
        score

        if fail:
            retry

        if 2 fails:
            pause → user input

    move next
```

---

# 7. Naming System

| Case         | Format                |
| ------------ | --------------------- |
| Single image | scene_01.png          |
| Multi-image  | scene_01a.png         |
| With project | project_scene_01a.png |

---

# 8. Reference Output

## `reference.txt`

```
Scene 01
Time: 0–8s
Type: INFOGRAPHIC
Files: scene_01a.png
Description: ...

---

Scene 02
Time: 8–12s
Type: TITLE
File: scene_02.png
Text: ...
```

---

# 9. Concurrency

* Batch size: 10
* Parallel workers: 3

---

# 10. Storage

* Sessions → `/sessions/*.json`
* Outputs → `/outputs/`
* Styles → `style_library.json`

---

# 11. Logging

* Structured logs
* Optional verbose mode
* Log:

  * prompts
  * responses
  * failures

---

# 12. Future-Proofing

* Multi-user ready
* Pluggable:

  * LLM provider
  * Image API
* Settings panel planned

---
