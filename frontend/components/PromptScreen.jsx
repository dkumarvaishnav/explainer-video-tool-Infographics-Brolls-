// PromptScreen.jsx - copy-ready prompt workspace

const PromptScreen = ({ theme, accent, density, sessionId, projectName, initialScenes, onScenesUpdated }) => {
  const t = THEMES[theme];
  const a = ACCENTS[accent];
  const [scenes, setScenes] = React.useState(initialScenes || []);
  const [viewMode, setViewMode] = React.useState(() => localStorage.getItem("promptViewMode") || "split");
  const [globalStyle, setGlobalStyle] = React.useState(() => localStorage.getItem("promptGlobalStyle") || "");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [copiedKey, setCopiedKey] = React.useState(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportFormat, setExportFormat] = React.useState("stacked");
  const [exportFileName, setExportFileName] = React.useState("");
  const pad = density === "compact" ? 16 : 24;

  const handleExport = (fileName, format) => {
    let text = `=========================================\n`;
    text += `PROJECT: ${projectName || "Untitled"}\n`;
    text += `PROMPTS MANIFEST (${format === "stacked" ? "SCENE SEQUENCE" : "SEPARATED BY TYPE"})\n`;
    text += `=========================================\n\n`;

    if (format === "stacked") {
      scenes.forEach((scene, i) => {
        text += `Scene ${String(scene.id).padStart(2, "0")} - ${scene.type}\n`;
        text += `Brief: ${scene.description || "Untitled"}\n`;
        text += `Duration: ${scene.start_time ? scene.start_time.substring(0, 8) : "--:--:--"} -> ${scene.end_time ? scene.end_time.substring(0, 8) : "--:--:--"}\n`;
        text += `Prompt:\n${scene.prompt || "No prompt generated."}\n`;
        if (i < scenes.length - 1) {
          text += `-----------------------------------------\n\n`;
        }
      });
    } else {
      const infographics = scenes.filter(s => s.type === "INFOGRAPHIC");
      const broll = scenes.filter(s => s.type === "BROLL");

      text += `-----------------------------------------\n`;
      text += `INFOGRAPHICS (total: ${infographics.length})\n`;
      text += `-----------------------------------------\n\n`;
      infographics.forEach((scene, i) => {
        text += `Scene ${String(scene.id).padStart(2, "0")} - INFOGRAPHIC\n`;
        text += `Brief: ${scene.description || "Untitled"}\n`;
        text += `Duration: ${scene.start_time ? scene.start_time.substring(0, 8) : "--:--:--"} -> ${scene.end_time ? scene.end_time.substring(0, 8) : "--:--:--"}\n`;
        text += `Prompt:\n${scene.prompt || "No prompt generated."}\n`;
        if (i < infographics.length - 1) {
          text += `-----------------------------------------\n\n`;
        }
      });

      text += `\n`;
      text += `-----------------------------------------\n`;
      text += `VIDEO B-ROLL (total: ${broll.length})\n`;
      text += `-----------------------------------------\n\n`;
      broll.forEach((scene, i) => {
        text += `Scene ${String(scene.id).padStart(2, "0")} - BROLL\n`;
        text += `Brief: ${scene.description || "Untitled"}\n`;
        text += `Duration: ${scene.start_time ? scene.start_time.substring(0, 8) : "--:--:--"} -> ${scene.end_time ? scene.end_time.substring(0, 8) : "--:--:--"}\n`;
        text += `Prompt:\n${scene.prompt || "No prompt generated."}\n`;
        if (i < broll.length - 1) {
          text += `-----------------------------------------\n\n`;
        }
      });
    }

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName || projectName || "project"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const openExportModal = () => {
    setExportFileName(projectName || "project");
    setExportFormat("stacked");
    setExportOpen(true);
  };

  React.useEffect(() => localStorage.setItem("promptViewMode", viewMode), [viewMode]);
  React.useEffect(() => localStorage.setItem("promptGlobalStyle", globalStyle), [globalStyle]);

  const updateScenes = (next) => {
    setScenes(next);
    if (onScenesUpdated) onScenesUpdated(next);
  };

  const generatePrompts = async (regenerate = false) => {
    if (!sessionId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          regenerate,
          global_style: globalStyle.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Prompt generation failed" }));
        throw new Error(err.detail || "Prompt generation failed");
      }
      const data = await res.json();
      updateScenes(data.scenes || []);
    } catch (e) {
      setError(e.message || "Prompt generation failed");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    const needsPrompts = (initialScenes || []).some((scene) => !scene.prompt);
    if (sessionId && (needsPrompts || scenes.length === 0)) {
      generatePrompts(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copyText = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch (e) {
      setError("Clipboard copy failed.");
    }
  };

  const setPrompt = (id, value) => {
    updateScenes(scenes.map((scene) => scene.id === id ? { ...scene, prompt: value } : scene));
  };

  const byType = (type) => scenes.filter((scene) => scene.type === type);
  const infographics = byType("INFOGRAPHIC");
  const broll = byType("BROLL");

  const blockColor = (type) => SCENE_TYPE_COLORS[type] || SCENE_TYPE_COLORS.INFOGRAPHIC;

  const copyAllFor = (type) => {
    const list = byType(type);
    const text = list.map((scene) => `Scene ${String(scene.id).padStart(2, "0")} - ${scene.type}\n${scene.prompt || ""}`).join("\n\n---\n\n");
    copyText(`all-${type}`, text);
  };

  const PromptBlock = ({ scene, compact = false }) => {
    const c = blockColor(scene.type);
    const key = `scene-${scene.id}`;
    return (
      <div style={{
        borderRadius: 8,
        border: `1px solid ${t.border}`,
        background: t.bgSurface,
        overflow: "hidden",
        borderLeft: `4px solid ${c.dot}`,
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: compact ? "8px 10px" : "10px 12px",
          borderBottom: `1px solid ${t.border}`,
          background: t.bgSubtle,
        }}>
          <span style={{ fontSize: 11, color: t.textSoft, fontFamily: FONTS.mono, width: 26 }}>
            {String(scene.id).padStart(2, "0")}
          </span>
          <Badge type={scene.type} />
          <span style={{
            flex: 1,
            minWidth: 0,
            color: t.textMid,
            fontSize: 11,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {scene.description || "Untitled scene"}
          </span>
          <Btn small variant="secondary" icon="copy" theme={theme} accent={accent} onClick={() => copyText(key, scene.prompt || "")}>
            {copiedKey === key ? "Copied" : "Copy"}
          </Btn>
        </div>
        <textarea
          value={scene.prompt || ""}
          onChange={(e) => setPrompt(scene.id, e.target.value)}
          rows={compact ? 5 : 7}
          placeholder={loading ? "Generating prompt..." : "Prompt will appear here."}
          style={{
            width: "100%",
            display: "block",
            resize: "vertical",
            minHeight: compact ? 118 : 160,
            border: "none",
            borderRadius: 0,
            outline: "none",
            background: t.bgSurface,
            color: t.text,
            padding: compact ? "10px 12px" : "12px 14px",
            fontSize: 12,
            lineHeight: 1.65,
            fontFamily: FONTS.mono,
          }}
        />
      </div>
    );
  };

  const SplitColumn = ({ title, type, scenes }) => {
    const c = blockColor(type);
    return (
      <section style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        border: `1px solid ${t.border}`,
        background: t.bg,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: t.bgSurface,
          borderBottom: `1px solid ${t.border}`,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{title}</div>
          <div style={{ fontSize: 11, color: t.textSoft, fontFamily: FONTS.mono }}>{scenes.length}</div>
          <div style={{ marginLeft: "auto" }}>
            <Btn small variant="secondary" icon="copy" theme={theme} accent={accent} onClick={() => copyAllFor(type)} disabled={scenes.length === 0}>
              {copiedKey === `all-${type}` ? "Copied" : "Copy all"}
            </Btn>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {scenes.length > 0 ? scenes.map((scene) => <PromptBlock key={scene.id} scene={scene} />) : (
            <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: t.textSoft, fontSize: 12 }}>
              No {title.toLowerCase()} scenes.
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: t.bg, overflow: "hidden" }}>
      <TopBar
        title="Prompt Workspace"
        subtitle={`${scenes.length} scenes${projectName ? ` - ${projectName}` : ""}`}
        theme={theme}
        accent={accent}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Btn
              variant={viewMode === "split" ? "primary" : "secondary"}
              icon="columns"
              theme={theme}
              accent={accent}
              onClick={() => setViewMode("split")}
            >
              Split
            </Btn>
            <Btn
              variant={viewMode === "sequence" ? "primary" : "secondary"}
              icon="list"
              theme={theme}
              accent={accent}
              onClick={() => setViewMode("sequence")}
            >
              Scene list
            </Btn>
            <Btn variant="secondary" icon="refresh" theme={theme} accent={accent} onClick={() => generatePrompts(true)} disabled={loading}>
              {loading ? "Generating..." : "Regenerate prompts"}
            </Btn>
            <Btn variant="primary" icon="download" theme={theme} accent={accent} onClick={openExportModal} disabled={loading || scenes.length === 0}>
              Export Prompts
            </Btn>
          </div>
        }
      />

      <div style={{ padding: `10px ${pad}px`, background: t.bgSurface, borderBottom: `1px solid ${t.border}`, display: "flex", gap: 10, alignItems: "center" }}>
        <label style={{ fontSize: 11, color: t.textSoft, fontWeight: 700, letterSpacing: "0.04em", flexShrink: 0 }}>
          STYLE NOTES
        </label>
        <input
          value={globalStyle}
          onChange={(e) => setGlobalStyle(e.target.value)}
          placeholder="Optional: consistent visual style, brand colors, realism level..."
          style={{
            flex: 1,
            padding: "7px 10px",
            borderRadius: 7,
            border: `1px solid ${t.border}`,
            background: t.bg,
            color: t.text,
            fontSize: 12,
            outline: "none",
          }}
        />
        <Btn small variant="secondary" theme={theme} accent={accent} onClick={() => generatePrompts(true)} disabled={loading}>
          Apply
        </Btn>
      </div>

      {error && (
        <div style={{ margin: `${pad}px ${pad}px 0`, padding: "10px 14px", borderRadius: 8, background: "oklch(94% 0.08 20)", border: "1px solid oklch(80% 0.1 20)", fontSize: 12, color: "oklch(35% 0.14 20)", display: "flex", gap: 8, alignItems: "center" }}>
          <Icon name="alertTriangle" size={13} color="oklch(45% 0.16 20)" />
          {error}
        </div>
      )}

      {loading && scenes.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t.textSoft, fontSize: 13 }}>
          Generating copy-ready prompts...
        </div>
      ) : viewMode === "split" ? (
        <div style={{ flex: 1, display: "flex", gap: 14, overflow: "hidden", padding: `${pad}px` }}>
          <SplitColumn title="Infographics" type="INFOGRAPHIC" scenes={infographics} />
          <SplitColumn title="Video B-roll" type="BROLL" scenes={broll} />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto", padding: `${pad}px`, display: "flex", flexDirection: "column", gap: 10 }}>
          {scenes.map((scene) => <PromptBlock key={scene.id} scene={scene} compact />)}
        </div>
      )}
      {exportOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            width: 440, background: t.bgSurface, border: `1px solid ${t.border}`, borderRadius: 12,
            padding: 24, boxShadow: "0 8px 30px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", gap: 18,
            fontFamily: FONTS.sansSerif,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Export Prompts</span>
              <button
                onClick={() => setExportOpen(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: t.textSoft, display: "flex", alignItems: "center" }}
              >
                <Icon name="x" size={16} color={t.textSoft} />
              </button>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.textSoft, marginBottom: 6, letterSpacing: "0.04em" }}>FILE NAME</label>
              <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                <input
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  placeholder="e.g. project-prompts"
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8,
                    border: `1px solid ${t.border}`, background: t.bg,
                    color: t.text, fontSize: 13, fontFamily: FONTS.mono,
                    outline: "none", boxSizing: "border-box",
                    paddingRight: 45,
                  }}
                />
                <span style={{ position: "absolute", right: 12, fontSize: 12, color: t.textSoft, fontFamily: FONTS.mono }}>.txt</span>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.textSoft, marginBottom: 8, letterSpacing: "0.04em" }}>EXPORT FORMAT</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { id: "stacked", label: "All prompts stacked", sub: "Scene list order (Scene 01, Scene 02...)" },
                  { id: "separated", label: "Separated by type", sub: "Infographics separate, Video B-roll separate" }
                ].map(opt => (
                  <label
                    key={opt.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 12px", borderRadius: 8, border: `1px solid ${exportFormat === opt.id ? a.main : t.border}`,
                      background: exportFormat === opt.id ? a.light : t.bg,
                      cursor: "pointer", boxSizing: "border-box",
                    }}
                  >
                    <input
                      type="radio"
                      name="exportFormat"
                      checked={exportFormat === opt.id}
                      onChange={() => setExportFormat(opt.id)}
                      style={{ marginTop: 3, accentColor: a.main }}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: exportFormat === opt.id ? a.text : t.text }}>{opt.label}</span>
                      <span style={{ fontSize: 10.5, color: t.textSoft }}>{opt.sub}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setExportOpen(false)} theme={theme} accent={accent}>Cancel</Btn>
              <Btn variant="primary" onClick={() => handleExport(exportFileName, exportFormat)} theme={theme} accent={accent}>Export</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { PromptScreen });
