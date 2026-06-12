# Infographic Automation Tool
## Product Requirements Document — v1.2

---

| Field | Detail |
|---|---|
| **Document Version** | 1.2 — Architecture & API Decisions |
| **Product Owner** | Kayyvee |
| **Current Scope** | V1 — Image Generation Pipeline |
| **V2 Scope (Deferred)** | Video Animation via Higgsfield / Seedance |
| **Target Environment** | Localhost (personal use) — cloud hosting deferred |
| **Last Updated** | May 2026 |

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Criteria](#3-goals--success-criteria)
4. [User Persona](#4-user-persona)
5. [Input Modes](#5-input-modes)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Architecture](#8-architecture)
9. [Tech Stack & API Decisions](#9-tech-stack--api-decisions)
10. [Project Folder Structure](#10-project-folder-structure)
11. [Phased Build Order](#11-phased-build-order)
12. [Feature Scope Table](#12-feature-scope-table)
13. [Open Questions](#13-open-questions)
14. [V2 Scope Notes](#14-v2-scope-notes)

---

## 1. Product Overview

The Infographic Automation Tool is a local, AI-powered web application that transforms video scripts into a complete set of polished visual assets — infographics, title cards, and descriptor text frames — ready to use directly in a video editing workflow.

The tool accepts two types of input: a timecoded `.srt` caption file, or a raw script (plain text). Depending on the input type, it uses different analytical strategies to determine the optimal scene distribution plan. From there, the pipeline is identical: an LLM generates the distribution mapping, the user reviews and approves it via a chat interface, images are generated via API, quality is self-evaluated and auto-regenerated if needed, and a complete named asset package is exported alongside a human-readable distribution reference document.

It is designed first for personal use by the product owner and later for potential productisation or team deployment.

---

## 2. Problem Statement

Creating visual assets for video explainer content today requires:

- Manually reading the script and deciding what visuals to show at each moment
- Separately prompting image generation tools for each scene — one by one
- Maintaining style consistency across all frames manually
- Renaming and organising files by hand after generation
- Keeping a separate manual map of which image goes at which timestamp in the editing timeline

This process is time-consuming, error-prone, and does not scale — especially for projects with 15 to 50+ scenes. There is no existing tool that takes a video script as input and outputs a complete, labelled, style-consistent visual asset package automatically.

---

## 3. Goals & Success Criteria

### 3.1 Primary Goals

- Accept both raw scripts and timecoded SRT files as valid inputs
- Automate the full pipeline from script input to named, exported image assets
- Maintain a human-in-the-loop approval gate before committing to generation
- Enforce visual style consistency across all generated assets in a project
- Self-evaluate generated images against the original plan and auto-regenerate below-threshold outputs
- Produce a distribution reference document alongside image exports

### 3.2 Out of Scope — V1

- Video animation or motion generation (deferred to V2)
- Cloud hosting or multi-user access
- Manual text input — all content is fully automated after user approval of the plan
- External publishing or direct NLE (Premiere Pro) integration

---

## 4. User Persona

**Primary User: Video Producer / Content Creator (solo operator)**

- Works on educational, training, or brand explainer video projects
- May receive raw scripts from clients or generate them via ChatGPT / LLM tools
- Will not always have a timecoded SRT file — raw scripts are equally common inputs
- Comfortable with local developer-grade tools and API keys
- Edits video in Adobe Premiere Pro or a similar NLE
- Wants full automation after an initial review-and-approve step
- Values consistent, clean, professional visual output over speed

---

## 5. Input Modes

This is a core design distinction. The tool supports two input modes. The user selects which mode applies at the start of a session. The downstream pipeline (style selection, generation, export) is identical for both modes. Only the mapping analysis strategy differs.

---

### Mode A — Timecoded SRT File

**When to use:** The user already has a timecoded `.srt` caption file for the video.

**How the system analyses it:**

- Each caption segment is parsed: index, start time, end time, text content
- Segment duration is calculated and stored as a first-class attribute
- Duration is the primary signal for scene type assignment:
  - Duration < 3 seconds → system prefers TITLE or DESCRIPTOR
  - Duration 3–6 seconds → HYBRID or INFOGRAPHIC depending on content richness
  - Duration > 6 seconds → INFOGRAPHIC preferred
- LLM may override the heuristic based on content type, with rationale noted in the mapping

**Reference document output:** Includes exact timestamp ranges (start → end) for every scene.

---

### Mode B — Raw Script (Plain Text)

**When to use:** The user has a raw script — written by themselves, generated by an LLM, or provided by a client — without any timecodes.

**How the system analyses it:**

- No duration data is available; duration heuristics cannot be applied
- The LLM analyses the script using **semantic importance** as the primary signal:
  - Key concept with strong visual potential → INFOGRAPHIC
  - Strong declarative headline statement → TITLE
  - Supporting fact, statistic, or data point → DESCRIPTOR
  - Bold statement with a supporting line → HYBRID
- The LLM evaluates narrative weight, information density, and visual potential of each passage

**Approximate duration input (required for Mode B):**

- At the start of a Mode B session, the user is asked: *"What is the approximate total duration of this video?"*
- The user provides a general estimate (e.g. "around 90 seconds" or "roughly 2 minutes")
- This is treated as a **soft target** — actual video may run 10–20% shorter or longer, which is expected and acceptable
- The LLM uses this estimate to calibrate total scene count and assign rough time budgets per scene for the reference document

**Reference document output:** Includes estimated timestamp ranges, clearly marked as estimated.

---

### Input Mode Comparison

| Signal | Mode A (SRT) | Mode B (Raw Script) |
|---|---|---|
| Primary scene type signal | Segment duration | Semantic importance |
| Duration data | Exact (from SRT) | Approximate (user estimate) |
| Timestamp in reference doc | Exact | Estimated |
| Scene count basis | Derived from SRT segments | LLM-suggested, calibrated to duration |
| User provides | `.srt` file | Plain text file or pasted text |
| Duration input needed | No | Yes — soft target (e.g. "~90 seconds") |

---

## 6. Functional Requirements

### 6.1 Input Layer

#### 6.1.1 Mode Selection
- User selects input mode at session start: **SRT File** or **Raw Script**
- UI adapts upload interface and follow-up prompts based on selection

#### 6.1.2 SRT Upload (Mode A)
- User uploads a `.srt` file
- System parses each segment: index, start time, end time, text, duration
- Short segments (default threshold: < 3 seconds) flagged as low-complexity

#### 6.1.3 Raw Script Upload (Mode B)
- User uploads a `.txt` / `.md` file or pastes text directly into a textbox
- System prompts: *"Approximate total video duration?"*
- User provides a general estimate — treated as a soft target
- System calibrates scene count and timing estimates to this figure

#### 6.1.4 Scene Count Suggestion (Both Modes)
- Optional: user may suggest a target scene count (e.g. "max 15 scenes")
- If not provided, LLM autonomously suggests a count based on content and duration
- Suggestion is surfaced in chat before the mapping is generated

---

### 6.2 Phase 1 — Scene Distribution Mapping

#### 6.2.1 LLM-Powered Mapping Generation
- LLM reads parsed input and generates a structured scene distribution table
- Fields per scene: scene number, timestamp range (exact or estimated), scene type, planned content description

#### 6.2.2 Scene Type Definitions

| Scene Type | Description | Typical Assignment |
|---|---|---|
| **INFOGRAPHIC** | Full AI-generated visual composition. Standalone — no text overlay. Clean, informative, self-explanatory. | Longer / content-rich segments |
| **TITLE** | Large, bold, prominent heading text rendered as an image by the AI tool. | Short, high-impact segments |
| **DESCRIPTOR** | Medium-weight explanatory text. Not a caption, not a headline. Used for stats, data points, supporting context. | Specific factual statements |
| **HYBRID** | TITLE + DESCRIPTOR combined in one frame. No infographic element. | Bold statement with a supporting line |

> INFOGRAPHIC scenes are always standalone — no text overlay. Text-based scene types (TITLE, DESCRIPTOR, HYBRID) have all text content generated by the AI image tool — no manual typing is required after plan approval.

#### 6.2.3 Duration / Semantic Heuristics
- **Mode A:** Duration drives scene type (see Section 5, Mode A)
- **Mode B:** Semantic importance drives scene type (see Section 5, Mode B)
- LLM may override any heuristic based on content, with reasoning logged in the mapping

#### 6.2.4 Human Review & Chat Interface
- Mapping table presented to user in a live chat interface
- User may request changes conversationally (e.g. "change scene 4 to TITLE", "merge scenes 7 and 8")
- LLM updates the mapping and re-presents it
- User explicitly approves the final plan before generation begins
- Approved plan is locked and stored for the session

---

### 6.3 Phase 2 — Style Configuration

#### 6.3.1 Style Preset Library
- Tool ships with a minimum of 3–4 built-in visual style presets
- Each preset contains: a name, a text description of the visual style, and optionally a reference image
- User selects one preset per project before generation

#### 6.3.2 Custom Style Options
- User may upload a custom reference image as a style guide
- User may provide a text description of the desired style
- Both can be combined
- User may add custom negative instructions (e.g. "no 3D elements", "vector only", "no text inside infographics")

#### 6.3.3 Save to Library
- After configuring a custom style, a "Save to Style Library" button is available
- Saved styles persisted locally and available in future sessions
- User may use a custom style for the current project only without saving

---

### 6.4 Phase 3 — Generation Pipeline

#### 6.4.1 Prompt Generation
- For each approved scene, the LLM generates a precise image generation prompt
- Prompt constructed from: scene type, planned content description, selected style guide (text + optional image reference), and custom negative instructions
- System prompt enforces: spelling accuracy, visual consistency, style adherence, text legibility for text-type scenes

#### 6.4.2 Image Generation API
- **V1 (testing):** Kie.ai API
- **Abstraction layer:** `image_service.py` wraps all image generation calls so the provider can be swapped without touching pipeline logic
- API key configured via `.env`

#### 6.4.3 Quality Scoring & Auto-Regeneration
- After each image is generated, the same LLM that created the mapping evaluates the output
- Evaluation criteria:
  - **Subject match** — does the image depict the planned content?
  - **Style consistency** — does it match the selected style preset?
  - **Complexity appropriateness** — suitable for the segment's duration/narrative weight?
  - **Text legibility** (TITLE / DESCRIPTOR / HYBRID only) — text clear and correctly spelled?
- Score of 1–10 assigned
- Score ≥ 8 → approved, pipeline advances to next scene
- Score < 8 → auto-regenerate (up to 3 attempts before flagging for manual review)

#### 6.4.4 Batch Processing
- User may choose batch size before generation: 1 (sequential), 5, or 10 at a time
- Within a batch, failed images regenerate immediately before the batch is considered complete
- User sees batch progress and can pause between batches

---

### 6.5 Phase 4 — Export

#### 6.5.1 Project Naming
- At session start, user optionally prompted for a project name
- If provided: `projectname_scene_01.png`, `projectname_scene_02.png`, etc.
- If not provided: `scene_01.png`, `scene_02.png`, etc.

#### 6.5.2 Export Package
- All approved images exported to a single local folder under `outputs/`
- Distribution reference document generated alongside images

#### 6.5.3 Distribution Reference Document
A plain `.md` file generated per project:

| Scene # | Timestamp | Scene Type | Caption Text | Filename |
|---|---|---|---|---|
| 01 | 00:00:03 → 00:00:08 | INFOGRAPHIC | "India's GDP grew by 8.4%..." | proj_scene_01.png |
| 02 | 00:00:08 → 00:00:10 | TITLE | "A decade of growth." | proj_scene_02.png |

> For **Mode B**, timestamp values are estimates derived from the user-provided duration and scene count. These are clearly marked as `(est.)` in the reference document.

---

## 7. Non-Functional Requirements

### 7.1 Performance
- Image generation time dictated by external API; UI must remain responsive during generation
- LLM scoring must complete within 10 seconds per image before the next generation begins
- Batch operations process concurrently within API rate limits

### 7.2 Reliability
- All API failures caught and surfaced to the user with a clear error message
- Failed images after 3 regeneration attempts flagged for manual review — pipeline does not break
- Session state (approved mapping, style, generated images) preserved locally in case of browser refresh

### 7.3 Security
- API keys stored in a local `.env` file and never exposed in the UI or logs
- No data sent to any server other than the configured LLM and image generation APIs
- Tool is localhost-only in V1; no authentication required

---

## 8. Architecture

The tool follows a **decoupled client-server architecture**, consistent with the product owner's existing media analyzer project.

### 8.1 Pattern
- **Backend:** Python + FastAPI — chosen for speed, native async/await support, and efficient handling of concurrent LLM and image generation API calls
- **Frontend:** Vanilla HTML, CSS, and JavaScript — lightweight, no framework overhead, perfectly suited for a single-user local tool
- **Communication:** RESTful API endpoints between frontend and backend
- **Decoupling benefit:** The Vanilla JS frontend can be swapped for Next.js in a future version (V2 or productisation) without any changes to the backend API

### 8.2 Backend Responsibilities
- SRT parsing and raw script ingestion
- All LLM calls (mapping generation, prompt generation, quality scoring) via Gemini API
- Image generation API calls via Kie.ai (abstracted for future provider swap)
- Session state management
- File export and reference document generation
- Background cleanup tasks to prevent output folder bloat

### 8.3 Frontend Responsibilities
- Mode selection UI (SRT vs Raw Script)
- File upload and text input
- Live chat interface for mapping review and approval
- Style configuration panel (preset selector, custom upload, save to library)
- Generation progress display (batch progress, per-scene status)
- Export trigger and download

### 8.4 Key API Endpoints (Planned)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/upload` | Accept SRT file or raw script text |
| POST | `/generate-mapping` | Trigger LLM scene distribution mapping |
| POST | `/chat` | Send user message, get updated mapping |
| POST | `/approve-mapping` | Lock the approved plan |
| POST | `/generate-images` | Start image generation pipeline |
| GET | `/status` | Poll generation progress |
| POST | `/export` | Trigger export and reference doc generation |
| GET | `/styles` | Get available style presets |
| POST | `/styles` | Save a new custom style to library |

---

## 9. Tech Stack & API Decisions

### 9.1 Backend
- **Language:** Python 3.11+
- **Framework:** FastAPI
- **Async:** Native async/await throughout
- **Background tasks:** FastAPI `BackgroundTasks` for file cleanup

### 9.2 Frontend
- **Vanilla HTML / CSS / JavaScript**
- No framework, no build step — open `index.html` directly or serve via FastAPI static files

### 9.3 LLM — Google Gemini
- **Provider:** Google Gemini (paid API key already available)
- **Model:** Latest available Gemini Flash or Pro model at build time — to be confirmed when starting development (currently Gemini 2.5 Flash is the recommended default)
- **Used for:** Script analysis, scene distribution mapping, per-scene prompt generation, image quality scoring
- **Library:** `google-generativeai` Python SDK

### 9.4 Image Generation — Kie.ai (V1 Testing)
- **Provider:** Kie.ai
- **Reason:** 80 free credits available on a new account — sufficient for full pipeline testing
- **Integration:** Via Kie.ai REST API, wrapped in `image_service.py`
- **Future swap:** `image_service.py` abstraction layer allows swapping to GPT Image 2, Higgsfield, or any other provider by changing one file

### 9.5 Configuration
- **API keys:** `.env` file (`GEMINI_API_KEY`, `KIE_API_KEY`)
- **Style library:** `style_library.json` — persisted locally, loaded on startup
- **Output directory:** `outputs/` — configurable path

### 9.6 Key Python Dependencies

```
fastapi
uvicorn
python-dotenv
google-generativeai
httpx
python-multipart
aiofiles
```

---

## 10. Project Folder Structure

```
infographic-automation/
│
├── backend/
│   ├── main.py                  # FastAPI app entry point, all route definitions
│   ├── srt_parser.py            # SRT file parsing — timecodes, durations, segments
│   ├── script_parser.py         # Raw script ingestion and chunking
│   ├── llm_service.py           # All Gemini API calls (mapping, prompts, scoring)
│   ├── image_service.py         # Image generation abstraction layer (Kie.ai in V1)
│   ├── scorer.py                # Image quality scoring logic and regeneration loop
│   ├── exporter.py              # File naming, export packaging, reference doc generation
│   ├── style_library.json       # Persisted style presets (built-in + user-saved)
│   └── session_store.py         # In-memory session state management
│
├── frontend/
│   ├── index.html               # Main UI shell
│   ├── style.css                # Styling
│   └── app.js                   # All frontend logic (upload, chat, generation, export)
│
├── outputs/                     # All generated assets land here (gitignored)
│   └── [project_name]/
│       ├── scene_01.png
│       ├── scene_02.png
│       └── distribution_reference.md
│
├── .env                         # API keys — never committed
├── .gitignore
├── requirements.txt
└── README.md
```

---

## 11. Phased Build Order

Each phase produces something independently testable. Never blocked waiting for the full system.

### Phase 1 — Input & Parsing
**Goal:** Both input modes working, clean structured data out.

- SRT parser: timecodes, durations, segment text
- Raw script ingestion: file upload + paste textbox
- Mode selection UI
- Mode B: approximate duration prompt and capture
- Output: JSON structure of parsed segments ready for LLM

**Test:** Upload a real `.srt` file and a raw script. Verify parsed output is correct.

---

### Phase 2 — LLM Mapping (Gemini)
**Goal:** Gemini reads input and returns a scene distribution table.

- Connect Gemini API via `llm_service.py`
- System prompt for mapping generation (duration-aware for Mode A, semantic for Mode B)
- Parse and display the returned mapping table in the UI
- Basic display only — no chat yet

**Test:** Feed a known script. Verify scene types and descriptions make sense.

---

### Phase 3 — Chat Review Interface
**Goal:** User can converse with the LLM to refine the mapping, then approve.

- Chat UI in `app.js` with message history
- `/chat` endpoint passes user message + current mapping to Gemini, returns updated mapping
- Approve button locks the plan and stores it in session
- Locked plan visible in UI as a read-only summary

**Test:** Request changes ("make scene 3 a TITLE"), verify mapping updates correctly.

---

### Phase 4 — Style Configuration
**Goal:** Style panel fully functional before any generation starts.

- Preset selector with 3–4 built-in styles
- Custom style: image upload + text description input
- Custom negative instructions textbox
- "Save to Library" button — persists to `style_library.json`
- Selected style stored in session alongside approved mapping

**Test:** Select a preset, upload a custom style, save it, verify it appears next session.

---

### Phase 5 — Image Generation & Scoring
**Goal:** Full generation pipeline working end to end.

- `image_service.py`: Kie.ai API integration
- `llm_service.py`: per-scene prompt generation from mapping + style
- `scorer.py`: Gemini evaluates each image, returns score + rationale
- Auto-regeneration loop (up to 3 attempts for score < 8)
- Manual review flag for images that fail all 3 attempts
- Batch size selector (1 / 5 / 10)
- Progress display per scene and per batch

**Test:** Run full generation on a 5-scene approved plan. Verify scoring and regeneration logic.

---

### Phase 6 — Export
**Goal:** Complete asset package delivered cleanly.

- `exporter.py`: copies approved images to `outputs/[project_name]/`
- Sequential naming: `projectname_scene_01.png` etc.
- Distribution reference `.md` generated with full scene table
- Mode B timestamps clearly marked `(est.)`
- Export button in UI triggers `/export` endpoint
- Success message with output folder path

**Test:** Complete a full run. Open the output folder. Verify naming, images, and reference doc.

---

## 12. Feature Scope Table

| Feature | Detail | Version |
|---|---|---|
| SRT file input + parsing | Full timecode + duration extraction | V1 |
| Raw script input (text/file) | Plain text or pasted script | V1 |
| Approximate duration input (Mode B) | Soft target for scene calibration | V1 |
| Dual analysis strategy | Duration-based (SRT) / Semantic (Raw) | V1 |
| Scene count suggestion | User input or LLM-generated | V1 |
| LLM mapping generation | Full distribution table with types | V1 |
| Chat review interface | Conversational edits + approval | V1 |
| Style preset library | 3–4 built-in presets | V1 |
| Custom style (image + text) | Upload + describe | V1 |
| Save to style library | Persist custom styles | V1 |
| Prompt generation per scene | LLM-generated, style-aware | V1 |
| Image generation API | Kie.ai (testing) | V1 |
| Image service abstraction layer | Swap provider by changing one file | V1 |
| Quality scoring (1–10) | Gemini self-evaluation | V1 |
| Auto-regeneration (score < 8) | Up to 3 attempts | V1 |
| Batch processing | 1 / 5 / 10 scenes per batch | V1 |
| Sequential export + naming | `projectname_scene_01.png` | V1 |
| Distribution reference doc | `.md` reference file per project | V1 |
| Estimated timestamps (Mode B) | Clearly marked as `(est.)` | V1 |
| Video animation | Higgsfield / Seedance 1.5 Pro | V2 |
| Cloud hosting | Multi-user deployment | V2 |
| Premiere Pro integration | Auto-import via ExtendScript | V2+ |

---

## 13. Open Questions

- **Batch UX:** If 2 of 5 images in a batch score < 8 and auto-regenerate, does the user see the full batch after regeneration completes, or see approved ones immediately as they finish?
- **Max regeneration attempts:** Currently set to 3 before flagging for manual review. Confirm this threshold.
- **Gemini model:** Confirm exact model string at build time. Current recommendation: `gemini-2.5-flash` or latest available Flash model.
- **Kie.ai API:** Confirm endpoint structure and credit consumption per generation call before building `image_service.py`.
- **SRT multi-line segments:** Some SRT files have multi-line caption blocks per timestamp — confirm parsing strategy.
- **Mode B timestamp labelling:** Exact wording for estimated timestamps (e.g. `~00:00:08 (est.)` vs `approx. 8s`).
- **Session persistence:** localStorage in the browser vs a lightweight SQLite on the backend for session state. Decide before Phase 3.

---

## 14. V2 Scope Notes

The following are explicitly deferred to V2 and should not influence V1 architecture, except where noted.

- **Video animation pipeline:** V1 exports become start/end frame assets for Higgsfield → Seedance 1.5 Pro
- **Animation settings (deferred):** 1:1 ratio, 4 seconds, fixed lens, 720p, no audio
- **Forward compatibility:** V1 image exports should use **1:1 aspect ratio** to ensure V2 compatibility without re-generation
- **Higgsfield MCP:** Already available (ultimate subscription). Evaluate MCP endpoints during V2 planning to determine if image generation endpoints exist that could replace Kie.ai
- Hosting and multi-user access
- Direct NLE integration (Premiere Pro auto-import)

---

*End of Document — Infographic Automation Tool PRD v1.2*
