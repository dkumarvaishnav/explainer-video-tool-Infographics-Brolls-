"""
FastAPI application entry point.

All routes are defined here. Business logic is delegated to service
modules (llm_service, image_service, scorer, exporter) â€” none of which
exist yet. Stubs return HTTP 501 until each phase is implemented.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse, Response, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.log_buffer import log_buffer as _log_buffer

from backend.schemas import (
    ApproveMappingRequest,
    ChatRequest,
    ChatResponse,
    ExportRequest,
    ExportResponse,
    GenerateMappingRequest,
    GeneratePromptsRequest,
    GenerateRequest,
    PromptResponse,
    RegenerateRequest,
    ResumeRequest,
    SessionDetailResponse,
    SessionListResponse,
    SessionResponse,
    SessionSummary,
    SetStyleRequest,
    StatusResponse,
    StopRequest,
    UploadRequest,
    UpdateScenesRequest,
)
from backend.session_store import store

logger = logging.getLogger(__name__)

# Register the log buffer as a handler on the root logger so every log
# statement in every module is captured and streamed to /terminal.
_root_logger = logging.getLogger()
_root_logger.addHandler(_log_buffer)
if _root_logger.level == logging.NOTSET or _root_logger.level > logging.DEBUG:
    _root_logger.setLevel(logging.DEBUG)


# ---------------------------------------------------------------------------
# Lifespan: restore persisted sessions on startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.restore_all()
    logger.info("Session store ready â€” %d session(s) restored", len(store.all_ids()))
    yield
    # shutdown: nothing to clean up in V1


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Infographic Automation API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _session_phase(session) -> str:
    if session.approved or any(scene.prompt for scene in session.scenes):
        return "prompts"
    if session.scenes:
        return "mapping"
    return "upload"


def _session_summary(session) -> SessionSummary:
    return SessionSummary(
        session_id=session.session_id,
        project_name=session.project_name,
        mode=session.mode,
        phase=_session_phase(session),
        approved=session.approved,
        scene_count=len(session.scenes),
        prompt_count=sum(1 for scene in session.scenes if scene.prompt),
        created_at=session.created_at,
        updated_at=session.updated_at,
    )

# Serve frontend â€” mounted last so API routes take priority.
# GET /  â†’ frontend/index.html
# GET /components/Shared.jsx etc. â†’ resolved relative to frontend/



# ---------------------------------------------------------------------------
# Debug Terminal
# ---------------------------------------------------------------------------

_TERMINAL_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Debug Terminal â€” Infographic Automator</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#080810;color:#b8b8d0;font-family:'Cascadia Code','Fira Code',Consolas,monospace;font-size:12px;display:flex;flex-direction:column}
#hdr{background:#0e0e18;border-bottom:1px solid #1e1e30;padding:9px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}
.dot{width:10px;height:10px;border-radius:50%}
.r{background:#e05252}.y{background:#e8c45a}.g{background:#52c47a}
#ttl{flex:1;font-size:13px;font-weight:700;color:#6868a0;letter-spacing:.06em}
#hdr button{background:#141420;border:1px solid #242438;color:#5858a0;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px;font-family:inherit}
#hdr button:hover{background:#1e1e30;color:#a0a0d0}
#fbar{background:#0c0c16;border-bottom:1px solid #181828;padding:5px 14px;display:flex;gap:8px;align-items:center;flex-shrink:0}
#fbar span{font-size:10px;color:#334;margin-right:2px}
#fbar button{background:#111120;border:1px solid #202030;color:#4c4c80;padding:3px 9px;border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit}
#fbar button:hover{background:#1a1a2c;color:#9090c0}
#fbar button.on{background:#181828;border-color:#5050a0;color:#9090d0}
#out{flex:1;overflow-y:auto;padding:10px 16px;display:flex;flex-direction:column;gap:0}
#out::-webkit-scrollbar{width:5px}
#out::-webkit-scrollbar-thumb{background:#1e1e30;border-radius:3px}
.ln{padding:2px 0 2px 10px;line-height:1.55;border-left:2px solid transparent;white-space:pre-wrap;word-break:break-all}
.ts{color:#303050;margin-right:6px}
.lv{margin-right:6px;font-weight:700}
.mo{color:#505090;margin-right:6px}
.ln.INFO .lv{color:#52aa7a}.ln.INFO{border-left-color:#1a3025}
.ln.DEBUG .lv{color:#384060}.ln.DEBUG .mo{color:#303050}.ln.DEBUG .msg{color:#383858}
.ln.WARNING .lv{color:#e8c45a}.ln.WARNING{border-left-color:#382e10;color:#b89848}
.ln.ERROR .lv{color:#e05252}.ln.ERROR{border-left-color:#381818;color:#c07070}
.ln.CRITICAL .lv{color:#ff3333}.ln.CRITICAL{background:#1a0808;border-left-color:#ff2222}
.sep{height:1px;background:#141422;margin:3px 0}
.ln.hidden{display:none}
#sbar{background:#0e0e18;border-top:1px solid #181828;padding:5px 16px;display:flex;gap:18px;align-items:center;flex-shrink:0;font-size:10px;color:#334}
#cled{width:6px;height:6px;border-radius:50%;background:#52c47a;flex-shrink:0}
#cled.off{background:#e05252}
.sv{color:#7070a0;font-weight:700}
.sv.err{color:#e05252}
.sv.wrn{color:#e8c45a}
</style>
</head>
<body>
<div id="hdr">
  <div class="dot r"></div><div class="dot y"></div><div class="dot g"></div>
  <div id="ttl">OBVIOUS INFOGRAPHICS â€” Debug Terminal</div>
  <span id="clbl" style="font-size:11px;color:#404060">Connectingâ€¦</span>
  <button onclick="clearLog()">Clear</button>
  <button onclick="copyAll()">Copy All</button>
  <button id="asbtn" onclick="toggleScroll()">Auto-scroll ON</button>
</div>
<div id="fbar">
  <span>SHOW:</span>
  <button class="on" onclick="setF('ALL',this)">All</button>
  <button onclick="setF('INFO',this)">Info</button>
  <button onclick="setF('WARNING',this)">Warnings</button>
  <button onclick="setF('ERROR',this)">Errors</button>
  <button onclick="setF('DEBUG',this)">Debug</button>
  <div style="flex:1"></div>
  <span id="lcnt" style="font-size:10px;color:#334">0 lines</span>
</div>
<div id="out"></div>
<div id="sbar">
  <div style="display:flex;gap:6px;align-items:center"><div id="cled" class="off"></div><span id="clbl2">â€”</span></div>
  <div>Lines: <span class="sv" id="tl">0</span></div>
  <div>Errors: <span class="sv err" id="ec">0</span></div>
  <div>Warnings: <span class="sv wrn" id="wc">0</span></div>
  <div style="margin-left:auto;color:#303050" id="lu">â€”</div>
</div>
<script>
const out=document.getElementById('out'),cled=document.getElementById('cled'),
  clbl=document.getElementById('clbl'),clbl2=document.getElementById('clbl2'),
  tlEl=document.getElementById('tl'),ecEl=document.getElementById('ec'),
  wcEl=document.getElementById('wc'),luEl=document.getElementById('lu'),
  lcntEl=document.getElementById('lcnt');
let filt='ALL',as=true,tl=0,ec=0,wc=0;

out.addEventListener('scroll',()=>{
  as=out.scrollTop+out.clientHeight>=out.scrollHeight-24;
  document.getElementById('asbtn').textContent='Auto-scroll '+(as?'ON':'OFF');
});
function toggleScroll(){as=!as;out.scrollTop=as?out.scrollHeight:out.scrollTop;document.getElementById('asbtn').textContent='Auto-scroll '+(as?'ON':'OFF');}

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function parseLevel(raw){const m=raw.match(/\] (\w+)\s+/);return m?m[1]:'INFO'}
function fmt(raw){
  const m=raw.match(/^\[([^\]]+)\]\s+(\w+)\s+([^:]+):\s*([\s\S]*)$/);
  if(m){const[,ts,lv,mo,msg]=m;return`<span class="ts">[${ts}]</span><span class="lv">${lv}</span><span class="mo">${esc(mo)}:</span><span class="msg">${esc(msg)}</span>`}
  return esc(raw);
}
function addLine(raw){
  const lv=parseLevel(raw);
  const d=document.createElement('div');
  d.className='ln '+lv;d.dataset.lv=lv;d.dataset.raw=raw;
  d.innerHTML=fmt(raw);
  if(filt!=='ALL'&&lv!==filt)d.classList.add('hidden');
  out.appendChild(d);
  if(raw.includes('" 2')||raw.includes('" 4')||raw.includes('" 5')){
    const s=document.createElement('div');s.className='sep';out.appendChild(s);
  }
  tl++;if(lv==='ERROR'||lv==='CRITICAL')ec++;if(lv==='WARNING')wc++;
  tlEl.textContent=tl;ecEl.textContent=ec;wcEl.textContent=wc;lcntEl.textContent=tl+' lines';
  luEl.textContent=new Date().toLocaleTimeString();
  if(as)requestAnimationFrame(()=>{out.scrollTop=out.scrollHeight;});
}
function setF(f,btn){
  filt=f;
  document.querySelectorAll('#fbar button').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('.ln').forEach(el=>el.classList.toggle('hidden',f!=='ALL'&&el.dataset.lv!==f));
}
function clearLog(){out.innerHTML='';tl=0;ec=0;wc=0;tlEl.textContent='0';ecEl.textContent='0';wcEl.textContent='0';lcntEl.textContent='0 lines';}
function copyAll(){
  const txt=[...document.querySelectorAll('.ln')].map(e=>e.dataset.raw).join('\n');
  navigator.clipboard.writeText(txt).catch(()=>alert(txt.substring(0,500)));
}
function connect(){
  const es=new EventSource('/logs/stream');
  es.onopen=()=>{cled.classList.remove('off');const t='Connected';clbl.textContent=t;clbl2.textContent=t;};
  es.onmessage=e=>{if(e.data)addLine(e.data);};
  es.onerror=()=>{cled.classList.add('off');clbl.textContent='Reconnectingâ€¦';clbl2.textContent='Disconnected';es.close();setTimeout(connect,2000);};
}
connect();
</script>
</body>
</html>"""


@app.get("/terminal", response_class=HTMLResponse, include_in_schema=False)
async def terminal():
    """Live debug terminal â€” streams all server logs in real time."""
    return HTMLResponse(_TERMINAL_HTML, headers={"Cache-Control": "no-cache"})


@app.get("/logs/stream", include_in_schema=False)
async def logs_stream():
    """SSE endpoint consumed by /terminal."""
    async def _event_gen():
        async for line in _log_buffer.stream():
            # SSE format: "data: <payload>\n\n"
            yield f"data: {line}\n\n"
    return StreamingResponse(
        _event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Phase 1 â€” Input & Parsing
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Project History
# ---------------------------------------------------------------------------

@app.get("/sessions", response_model=SessionListResponse, tags=["Projects"])
async def list_sessions():
    """Return saved project sessions, newest first."""
    store.delete_expired(days=30)
    sessions = sorted(
        store.all_sessions(),
        key=lambda session: session.updated_at,
        reverse=True,
    )
    return SessionListResponse(sessions=[_session_summary(session) for session in sessions])


@app.get("/sessions/{session_id}", response_model=SessionDetailResponse, tags=["Projects"])
async def get_session(session_id: str):
    """Return a saved session with full scene and prompt state."""
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionDetailResponse(session=session)


@app.delete("/sessions/{session_id}", response_model=SessionResponse, tags=["Projects"])
async def delete_session(session_id: str):
    """Delete a saved project session manually."""
    if store.get(session_id) is None:
        raise HTTPException(status_code=404, detail="Session not found")
    store.delete(session_id)
    return SessionResponse(session_id=session_id, status="deleted")


@app.post("/upload", response_model=SessionResponse, tags=["Phase 1 - Input"])
async def upload(body: UploadRequest):
    """
    Accept an SRT file or raw script text.
    Creates a new session and returns its ID.

    Mode A (srt): parse timecodes â†’ build Scene list via heuristics.
    Mode B (script): stores raw text; /generate-mapping does the scene work.
    """
    import uuid
    from backend.schemas import Session
    from backend.srt_parser import parse_srt
    from backend.script_parser import parse_script

    session_id = str(uuid.uuid4())

    if body.mode == "srt":
        scenes = parse_srt(body.content)
    else:
        scenes = parse_script(
            body.content,
            duration_estimate=body.duration_estimate,
            scene_count_hint=body.scene_count_hint,
        )

    session = Session(
        session_id=session_id,
        mode=body.mode,
        raw_input=body.content,
        project_name=body.project_name,
        duration_estimate=body.duration_estimate,
        scene_count_hint=body.scene_count_hint,
        scenes=scenes,
        total_scenes=len(scenes),
    )
    store.create(session)
    await store.persist(session)
    logger.info("Session %s created â€” mode=%s scenes=%d", session_id, body.mode, len(scenes))
    return SessionResponse(session_id=session_id, status="created")


# ---------------------------------------------------------------------------
# Phase 2 â€” LLM Mapping
# ---------------------------------------------------------------------------

@app.post("/generate-mapping", response_model=ChatResponse, tags=["Phase 2 â€” Mapping"])
async def generate_mapping(body: GenerateMappingRequest):
    """
    Trigger Gemini to produce the initial scene distribution table.
    Requires an existing session from /upload.
    """
    from backend.llm_service import generate_mapping as llm_generate_mapping

    session = store.get(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        if session.mode == "srt":
            # Convert existing Scene objects back to segment dicts for the LLM
            segments = [
                {
                    "index": s.id,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "text": s.source_text or s.text or s.description,
                    "duration_seconds": None,
                }
                for s in session.scenes
            ]
        else:
            segments = [{"text": session.raw_input}]

        scenes = await llm_generate_mapping(
            segments=segments,
            mode=session.mode,
            duration_estimate=session.duration_estimate,
            scene_count_hint=session.scene_count_hint,
        )
    except Exception as exc:
        logger.error("generate_mapping failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}")

    session.scenes = scenes
    session.total_scenes = len(scenes)
    logger.info("generate_mapping endpoint: persisting %d scenes for session %s", len(scenes), body.session_id)
    await store.persist(session)
    logger.info("generate_mapping endpoint: persist complete, building response")

    infographic_count = sum(1 for s in scenes if s.type == "INFOGRAPHIC")
    broll_count = sum(1 for s in scenes if s.type == "BROLL")
    reply = (
        f"Generated a {len(scenes)}-scene asset plan: {infographic_count} "
        f"infographic{'s' if infographic_count != 1 else ''} and {broll_count} "
        f"b-roll scene{'s' if broll_count != 1 else ''}. Review and edit it before approving."
    )
    logger.info("generate_mapping endpoint: returning ChatResponse with %d scenes", len(scenes))
    return ChatResponse(session_id=session.session_id, reply=reply, scenes=scenes)


# ---------------------------------------------------------------------------
# Phase 3 â€” Chat Review & Approval
# ---------------------------------------------------------------------------

@app.post("/chat", response_model=ChatResponse, tags=["Phase 3 â€” Chat"])
async def chat(body: ChatRequest):
    """
    Conversational mapping edits.
    Passes user message + current scene list to Gemini, returns updated scenes.
    """
    from backend.llm_service import update_mapping_chat

    session = store.get(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.approved:
        raise HTTPException(status_code=400, detail="Mapping is locked â€” cannot edit after approval")

    try:
        updated_scenes, reply = await update_mapping_chat(
            scenes=session.scenes,
            user_message=body.message,
            _mode=session.mode,
        )
    except Exception as exc:
        logger.error("chat edit failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}")

    session.scenes = updated_scenes
    session.total_scenes = len(updated_scenes)
    await store.persist(session)

    return ChatResponse(session_id=session.session_id, reply=reply, scenes=updated_scenes)


@app.post("/update-scenes", response_model=ChatResponse, tags=["Phase 3 - Mapping"])
async def update_scenes(body: UpdateScenesRequest):
    """
    Persist manual edits made in the mapping UI.
    """
    from backend.llm_service import renumber_scenes, validate_scenes

    session = store.get(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.approved:
        raise HTTPException(status_code=400, detail="Mapping is locked")

    scenes = renumber_scenes(body.scenes)
    errors = validate_scenes(scenes)
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})

    session.scenes = scenes
    session.total_scenes = len(scenes)
    await store.persist(session)

    return ChatResponse(
        session_id=session.session_id,
        reply=f"Saved {len(scenes)} scene{'s' if len(scenes) != 1 else ''}.",
        scenes=scenes,
    )


@app.post("/approve-mapping", response_model=SessionResponse, tags=["Phase 3 â€” Chat"])
async def approve_mapping(body: ApproveMappingRequest):
    """
    Lock the approved plan. Sets session.approved = True.
    No further /chat edits are accepted after this point.
    """
    session = store.get(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session.approved = True
    await store.persist(session)
    return SessionResponse(session_id=body.session_id, status="approved")


@app.post("/generate-prompts", response_model=PromptResponse, tags=["Phase 4 - Prompts"])
async def generate_prompts(body: GeneratePromptsRequest):
    """
    Generate copy-ready prompts for the approved scene plan.
    """
    from backend.llm_service import generate_prompts as llm_generate_prompts

    session = store.get(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.approved:
        raise HTTPException(status_code=400, detail="Mapping must be approved before prompt generation")
    if not session.scenes:
        raise HTTPException(status_code=400, detail="No scenes available for prompt generation")

    try:
        session.scenes = await llm_generate_prompts(
            session.scenes,
            regenerate=body.regenerate,
            global_style=body.global_style,
        )
    except Exception as exc:
        logger.error("generate_prompts failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}")

    await store.persist(session)
    return PromptResponse(
        session_id=session.session_id,
        reply=f"Generated prompts for {len(session.scenes)} scenes.",
        scenes=session.scenes,
    )


# ---------------------------------------------------------------------------
# Phase 5 â€” Generation Pipeline
# ---------------------------------------------------------------------------

@app.post("/generate", response_model=SessionResponse, tags=["Phase 5 â€” Generation"])
async def generate(body: GenerateRequest, background_tasks: BackgroundTasks):
    """
    Automatic image generation is disabled in the prompt-only workflow.
    """
    _ = body, background_tasks
    raise HTTPException(
        status_code=410,
        detail="Automatic image generation is disabled. Use /generate-prompts instead.",
    )


@app.post("/stop", response_model=SessionResponse, tags=["Phase 5 â€” Generation"])
async def stop(body: StopRequest):
    """
    Automatic generation is disabled in the prompt-only workflow.
    """
    _ = body
    raise HTTPException(status_code=410, detail="Automatic generation is disabled.")


@app.post("/set-style", response_model=SessionResponse, tags=["Phase 4 â€” Style"])
async def set_style(body: SetStyleRequest):
    """
    Persist the chosen style config on the session.
    Must be called before /generate.
    """
    session = store.get(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    from backend.schemas import StyleConfig
    session.style = StyleConfig(
        name=body.name,
        prompt=body.prompt,
        background_color=body.background_color,
        reference_image=body.reference_image,
    )
    await store.persist(session)
    return SessionResponse(session_id=body.session_id, status="style_set")


@app.post("/resume", response_model=SessionResponse, tags=["Phase 5 â€” Generation"])
async def resume(body: ResumeRequest, background_tasks: BackgroundTasks):
    """
    Automatic generation is disabled in the prompt-only workflow.
    """
    _ = body, background_tasks
    raise HTTPException(status_code=410, detail="Automatic generation is disabled.")


@app.post("/regenerate-scenes", response_model=SessionResponse, tags=["Phase 5 â€” Generation"])
async def regenerate_scenes(body: RegenerateRequest):
    """
    Automatic generation is disabled in the prompt-only workflow.
    """
    _ = body
    raise HTTPException(status_code=410, detail="Automatic generation is disabled. Edit the mapping and regenerate prompts instead.")


@app.get("/status", response_model=StatusResponse, tags=["Phase 5 â€” Generation"])
async def status(session_id: str):
    """
    Poll generation progress.
    Returns current scene statuses, index, and any failed scene IDs.
    """
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    return StatusResponse(
        session_id=session.session_id,
        status=session.status,
        current_scene=session.current_index,
        total_scenes=len(session.scenes),
        completed_scenes=session.completed_scenes,
        failed_scenes=session.failed_scenes,
        paused_for_review=session.paused_for_review,
        scenes=session.scenes,
    )


@app.get("/logs", response_class=PlainTextResponse, tags=["Phase 5 â€” Generation"])
async def logs(session_id: str):
    """Return the full log file for a session."""
    from pathlib import Path
    log_path = Path("sessions") / f"{session_id}_log.txt"
    if not log_path.exists():
        raise HTTPException(status_code=404, detail="Log not found for session")
    return log_path.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Phase 6 â€” Export
# ---------------------------------------------------------------------------

@app.post("/export", response_model=ExportResponse, tags=["Phase 6 â€” Export"])
async def export(body: ExportRequest):
    """
    Export the prompt plan as a markdown reference file.
    """
    from pathlib import Path

    session = store.get(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    project_name = body.project_name or session.project_name
    folder_name = project_name or session.session_id
    output_dir = Path("outputs") / folder_name
    output_dir.mkdir(parents=True, exist_ok=True)

    lines = [f"# Prompt Reference - {folder_name}", ""]
    for scene in session.scenes:
        timestamp = "unknown"
        if scene.start_time or scene.end_time:
            timestamp = f"{scene.start_time or '?'} -> {scene.end_time or '?'}"
            if scene.estimated:
                timestamp += " (est.)"
        lines.extend([
            f"## Scene {scene.id:02d} - {scene.type}",
            "",
            f"Time: {timestamp}",
            "",
            f"Description: {scene.description}",
            "",
        ])
        if scene.source_text:
            lines.extend(["Source:", "", scene.source_text, ""])
        lines.extend(["Prompt:", "", scene.prompt or "", "", "---", ""])

    reference_doc = "\n".join(lines)
    ref_path = output_dir / "prompt_reference.md"
    ref_path.write_text(reference_doc, encoding="utf-8")
    output_path = str(output_dir.resolve())

    return ExportResponse(
        session_id=body.session_id,
        output_path=output_path,
        reference_doc=reference_doc,
    )


# ---------------------------------------------------------------------------
# Frontend static files â€” mounted LAST so all API routes above take priority.
# GET /            â†’ frontend/index.html
# GET /components/ â†’ frontend/components/...
# ---------------------------------------------------------------------------

class _NoCacheStaticFiles(StaticFiles):
    """StaticFiles with cache disabled â€” ensures fresh JS on every reload."""
    async def get_response(self, path: str, scope) -> Response:
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

app.mount("/", _NoCacheStaticFiles(directory="frontend", html=True), name="frontend")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
