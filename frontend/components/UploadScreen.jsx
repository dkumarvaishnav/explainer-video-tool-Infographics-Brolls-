
// UploadScreen.jsx — Phase 1: Input mode selection + upload

const UploadScreen = ({ theme, accent, density, onNext }) => {
  const t = THEMES[theme];
  const a = ACCENTS[accent];
  const [mode, setMode] = React.useState(null); // "srt" | "script"
  const [dragging, setDragging] = React.useState(false);
  const [fileName, setFileName] = React.useState(null);
  const [fileContent, setFileContent] = React.useState(null);
  const [pastedText, setPastedText] = React.useState("");
  const [duration, setDuration] = React.useState("");
  const [sceneHint, setSceneHint] = React.useState("");
  const [projectName, setProjectName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const fileInputRef = React.useRef(null);
  const pad = density === "compact" ? 20 : 32;

  const ready = projectName.trim().length > 0 && mode && (fileContent || pastedText.trim().length > 20);

  const readFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setFileName(file.name);
      setFileContent(e.target.result);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const handleFileClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) readFile(file);
  };

  const parseDurationToSeconds = (str) => {
    if (!str.trim()) return null;
    const m = str.match(/(\d+)\s*min/i);
    const s = str.match(/(\d+)\s*sec/i);
    const n = str.match(/^(\d+)$/);
    if (m) return parseInt(m[1]) * 60 + (s ? parseInt(s[1]) : 0);
    if (s) return parseInt(s[1]);
    if (n) return parseInt(n[1]);
    return null;
  };

  const handleGenerate = async () => {
    if (!ready || loading) return;
    setLoading(true);
    setError(null);
    try {
      const content = mode === "srt" ? fileContent : pastedText;
      const body = {
        mode,
        content,
        project_name: projectName.trim() || null,
        duration_estimate: parseDurationToSeconds(duration),
        scene_count_hint: sceneHint.trim() ? parseInt(sceneHint) || null : null,
      };
      const res = await fetch("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
      const data = await res.json();
      onNext(data.session_id, projectName.trim() || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: t.bg, overflow: "auto" }}>
      <TopBar
        title="New Project"
        subtitle="Name the project and upload a script or captions file"
        theme={theme} accent={accent}
        actions={
          <Btn variant="primary" icon="chevronRight" theme={theme} accent={accent}
            onClick={handleGenerate} disabled={!ready || loading}>
            {loading ? "Uploading..." : "Create Mapping"}
          </Btn>
        }
      />

      <div style={{ flex: 1, padding: `${pad}px`, maxWidth: 760, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "oklch(94% 0.08 20)", border: "1px solid oklch(80% 0.1 20)", fontSize: 12, color: "oklch(35% 0.14 20)", display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="alertTriangle" size={13} color="oklch(45% 0.16 20)" />
            {error}
          </div>
        )}

        {/* Project name */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.textMid, marginBottom: 6, letterSpacing: "0.04em" }}>PROJECT NAME</label>
          <input
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder="e.g. india-gdp-explainer"
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 8,
              border: `1px solid ${t.border}`, background: t.bgSurface,
              color: t.text, fontSize: 13, fontFamily: FONTS.mono,
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Mode selection */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.textMid, marginBottom: 10, letterSpacing: "0.04em" }}>INPUT MODE</label>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { id: "srt", label: "SRT File", sub: "Timecoded captions with exact timestamps", icon: "clock" },
              { id: "script", label: "Raw Script", sub: "Plain text or pasted script with estimated timestamps", icon: "file" },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => { setMode(opt.id); setFileName(null); setFileContent(null); setPastedText(""); }}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", gap: 8,
                  padding: density === "compact" ? "14px 16px" : "18px 20px",
                  borderRadius: 12, border: `2px solid ${mode === opt.id ? a.main : t.border}`,
                  background: mode === opt.id ? a.light : t.bgSurface,
                  cursor: "pointer", textAlign: "left", transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: mode === opt.id ? a.main : t.bgSubtle,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Icon name={opt.icon} size={15} color={mode === opt.id ? "#fff" : t.textSoft} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: mode === opt.id ? a.text : t.text }}>{opt.label}</span>
                  {mode === opt.id && (
                    <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: a.main, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="check" size={10} color="#fff" />
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: t.textSoft, lineHeight: 1.5, paddingLeft: 40 }}>{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Upload area */}
        {mode && (
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.textMid, marginBottom: 8, letterSpacing: "0.04em" }}>
              {mode === "srt" ? "SRT FILE" : "SCRIPT"}
            </label>

            {mode === "srt" ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".srt"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={handleFileClick}
                  style={{
                    border: `2px dashed ${dragging ? a.main : t.border}`,
                    borderRadius: 12, padding: density === "compact" ? "28px 20px" : "40px 20px",
                    background: dragging ? a.light : t.bgSubtle,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                    cursor: "pointer", transition: "all 0.15s ease",
                  }}
                >
                  {fileName ? (
                    <>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: a.light, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="file" size={20} color={a.main} />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.text, fontFamily: FONTS.mono }}>{fileName}</div>
                      <div style={{ fontSize: 11, color: t.textSoft }}>Click to replace</div>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: t.bgSurface, border: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="upload" size={18} color={t.textSoft} />
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: t.text }}>Drop your .srt file here</div>
                        <div style={{ fontSize: 11, color: t.textSoft, marginTop: 3 }}>or click to browse</div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <textarea
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder={"Paste your script here, or start typing…\n\nIndia's GDP grew by 8.4% in the last fiscal year, marking the fastest growth among major economies. This growth was driven by three key sectors: manufacturing, services, and infrastructure investment…"}
                style={{
                  width: "100%", minHeight: density === "compact" ? 140 : 180,
                  padding: "12px 14px", borderRadius: 10,
                  border: `1px solid ${t.border}`, background: t.bgSurface,
                  color: t.text, fontSize: 12, fontFamily: FONTS.mono,
                  lineHeight: 1.7, resize: "vertical", outline: "none",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>
        )}

        {/* Mode B extras */}
        {mode === "script" && (
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.textMid, marginBottom: 6, letterSpacing: "0.04em" }}>APPROXIMATE DURATION</label>
              <input
                value={duration}
                onChange={e => setDuration(e.target.value)}
                placeholder="e.g. 90 seconds, ~2 minutes"
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8,
                  border: `1px solid ${t.border}`, background: t.bgSurface,
                  color: t.text, fontSize: 12, fontFamily: FONTS.mono,
                  outline: "none", boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 10, color: t.textSoft, marginTop: 4 }}>Used to calibrate scene count. ±20% is fine.</div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.textMid, marginBottom: 6, letterSpacing: "0.04em" }}>SCENE COUNT (OPTIONAL)</label>
              <input
                value={sceneHint}
                onChange={e => setSceneHint(e.target.value)}
                placeholder="e.g. 12, max 15"
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8,
                  border: `1px solid ${t.border}`, background: t.bgSurface,
                  color: t.text, fontSize: 12, fontFamily: FONTS.mono,
                  outline: "none", boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 10, color: t.textSoft, marginTop: 4 }}>Leave blank — LLM will decide.</div>
            </div>
          </div>
        )}

        {/* Info card */}
        {!mode && (
          <div style={{
            padding: "14px 16px", borderRadius: 10,
            background: t.bgSubtle, border: `1px solid ${t.border}`,
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <Icon name="info" size={14} color={t.textSoft} style={{ marginTop: 1 }} />
            <div style={{ fontSize: 11, color: t.textSoft, lineHeight: 1.6 }}>
              Select an input mode above. The AI creates a first draft scene map, then you can edit every scene before prompts are generated.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { UploadScreen });
