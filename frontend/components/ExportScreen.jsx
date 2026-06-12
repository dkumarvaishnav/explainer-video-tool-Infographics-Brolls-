
// ExportScreen.jsx — Phase 6: Export + reference doc

const EXPORT_COLS = [
  { key: "num",   label: "#",          w: 32  },
  { key: "type",  label: "Type",       w: 118 },
  { key: "desc",  label: "Description", flex: 1 },
  { key: "time",  label: "Timestamp",  w: 116 },
  { key: "score", label: "Score",      w: 60  },
  { key: "file",  label: "Filename",   w: 140 },
];

const ExportScreen = ({ theme, accent, density, sessionId, projectName, scenes }) => {
  const t = THEMES[theme];
  const a = ACCENTS[accent];
  const [exported, setExported] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [exportPath, setExportPath] = React.useState(null);
  const [refDoc, setRefDoc] = React.useState(null);
  const [error, setError] = React.useState(null);
  const pad = density === "compact" ? 16 : 24;

  const displayScenes = scenes || [];
  const completedScenes = displayScenes.filter(s => s.status === "completed");

  const avgScore = completedScenes.length > 0
    ? (completedScenes.reduce((s, sc) => s + (sc.score || 0), 0) / completedScenes.length).toFixed(1)
    : "—";

  const totalImages = displayScenes.reduce((acc, s) => acc + (s.image_paths ? s.image_paths.filter(Boolean).length : 0), 0);

  const formatTime = (scene) => {
    if (!scene.start_time && !scene.end_time) return "—";
    const start = scene.start_time?.substring(0, 8) || "?";
    const end = scene.end_time?.substring(0, 8) || "?";
    return `${start} → ${end}`;
  };

  const getFilename = (scene) => {
    if (scene.image_paths && scene.image_paths[0]) {
      return scene.image_paths[0].split(/[\\/]/).pop();
    }
    const prefix = projectName ? `${projectName}_` : "";
    return `${prefix}scene_${String(scene.id).padStart(2, "0")}.png`;
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, project_name: projectName || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Export failed");
      }
      const data = await res.json();
      setExportPath(data.output_path);
      setRefDoc(data.reference_doc);
      setExported(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const refDocText = refDoc || `# Distribution Reference${projectName ? ` — ${projectName}` : ""}
Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

| Scene | Timestamp       | Type        | Description                    | File                         |
|-------|-----------------|-------------|--------------------------------|------------------------------|
${displayScenes.map(s => {
  const fn = getFilename(s);
  const ts = formatTime(s);
  return `| ${String(s.id).padStart(2, "0")}    | ${ts.padEnd(15)} | ${s.type.padEnd(11)} | ${(s.description || "").substring(0, 30).padEnd(30)} | ${fn} |`;
}).join("\n")}`;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: t.bg, overflow: "auto" }}>
      <TopBar
        title="Export Package"
        subtitle="Review and package your generated assets"
        theme={theme} accent={accent}
        actions={
          exported ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "oklch(93% 0.07 140)", color: "oklch(35% 0.12 140)", fontSize: 12, fontWeight: 600 }}>
              <Icon name="checkCircle" size={12} color="oklch(35% 0.12 140)" />
              Exported to {exportPath || "outputs/"}
            </div>
          ) : (
            <Btn variant="primary" icon="download" theme={theme} accent={accent} onClick={handleExport} disabled={exporting}>
              {exporting ? "Exporting…" : "Export Package"}
            </Btn>
          )
        }
      />

      <div style={{ padding: `${pad}px`, maxWidth: 860, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "oklch(94% 0.08 20)", border: "1px solid oklch(80% 0.1 20)", fontSize: 12, color: "oklch(35% 0.14 20)", display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="alertTriangle" size={13} color="oklch(45% 0.16 20)" />
            {error}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "Total Scenes",  value: String(displayScenes.length), icon: "layers" },
            { label: "Total Images",  value: String(totalImages || completedScenes.length), icon: "image"  },
            { label: "Avg Score",     value: avgScore, icon: "star"   },
            { label: "Failed",        value: String(displayScenes.filter(s => s.status === "failed").length), icon: "alertTriangle" },
          ].map(stat => (
            <div key={stat.label} style={{
              flex: 1,
              padding: density === "compact" ? "12px 14px" : "14px 18px",
              borderRadius: 10, background: t.bgSurface,
              border: `1px solid ${t.border}`,
              display: "flex", flexDirection: "column", gap: 6,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name={stat.icon} size={13} color={a.main} />
                <span style={{ fontSize: 10, color: t.textSoft, letterSpacing: "0.06em", fontWeight: 600 }}>
                  {stat.label.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: t.text, fontFamily: FONTS.mono }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Scene manifest */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.textMid, marginBottom: 10, letterSpacing: "0.04em" }}>
            SCENE MANIFEST
          </label>
          <div style={{ background: t.bgSurface, borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden" }}>
            {/* Header row */}
            <div style={{
              display: "flex", alignItems: "center",
              padding: "8px 16px",
              borderBottom: `1px solid ${t.border}`,
              background: t.bgSubtle,
            }}>
              {EXPORT_COLS.map(col => (
                <div key={col.key} style={{
                  width: col.w, flex: col.flex || undefined, flexShrink: 0,
                  fontSize: 10, fontWeight: 700, color: t.textSoft, letterSpacing: "0.06em",
                }}>
                  {col.label}
                </div>
              ))}
            </div>

            {/* Data rows */}
            {displayScenes.map((scene, i) => {
              const scoreColor = scene.score >= 8 ? "oklch(50% 0.14 140)" : scene.score >= 7 ? "oklch(58% 0.14 72)" : t.textSoft;
              const isAlt = i % 2 !== 0;
              const filename = getFilename(scene);
              return (
                <div
                  key={scene.id}
                  style={{
                    display: "flex", alignItems: "center",
                    padding: "9px 16px",
                    borderBottom: i < displayScenes.length - 1 ? `1px solid ${t.border}` : "none",
                    background: isAlt
                      ? (theme === "light" ? "oklch(99% 0.003 250)" : "oklch(17% 0.012 265)")
                      : "transparent",
                    minWidth: 0,
                  }}
                >
                  <div style={{ width: 32, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: t.textSoft, fontFamily: FONTS.mono }}>
                      {String(scene.id).padStart(2, "0")}
                    </span>
                  </div>
                  <div style={{ width: 118, flexShrink: 0 }}>
                    <Badge type={scene.type} />
                  </div>
                  <div style={{ flex: 1, paddingRight: 12, minWidth: 0 }}>
                    <span style={{
                      fontSize: 11, color: t.text,
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", display: "block",
                    }}>
                      {scene.description}
                    </span>
                  </div>
                  <div style={{ width: 116, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: t.textSoft, fontFamily: FONTS.mono, whiteSpace: "nowrap" }}>
                      {formatTime(scene)}{scene.estimated ? " (est.)" : ""}
                    </span>
                  </div>
                  <div style={{ width: 60, flexShrink: 0 }}>
                    {scene.score != null ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor, fontFamily: FONTS.mono }}>
                        {scene.score.toFixed(1)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: t.textSoft, fontFamily: FONTS.mono }}>—</span>
                    )}
                  </div>
                  <div style={{ width: 140, flexShrink: 0, minWidth: 0 }}>
                    <span style={{
                      fontSize: 9, color: t.textSoft, fontFamily: FONTS.mono,
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", display: "block",
                    }}>
                      {filename}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reference doc preview */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: t.textMid, letterSpacing: "0.04em" }}>
              DISTRIBUTION REFERENCE
              <span style={{ fontWeight: 400, color: t.textSoft, marginLeft: 6 }}>distribution_reference.md</span>
            </label>
          </div>
          <div style={{
            borderRadius: 10, border: `1px solid ${t.border}`,
            background: theme === "light" ? "oklch(13% 0.01 250)" : "oklch(9% 0.01 265)",
            overflow: "hidden",
          }}>
            <div style={{
              padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)",
              display: "flex", gap: 6, alignItems: "center",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(68% 0.14 20)" }} />
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(68% 0.14 72)" }} />
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(68% 0.14 140)" }} />
            </div>
            <pre style={{
              padding: "14px 16px", margin: 0, overflow: "auto",
              fontSize: 10.5, fontFamily: FONTS.mono, lineHeight: 1.7,
              color: "oklch(72% 0.006 250)", whiteSpace: "pre",
            }}>{refDocText}</pre>
          </div>
        </div>

        {/* Export success banner */}
        {exported && (
          <div style={{
            padding: "12px 16px", borderRadius: 10,
            background: "oklch(93% 0.07 140)", border: "1px solid oklch(80% 0.1 140)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <Icon name="folder" size={16} color="oklch(38% 0.12 140)" />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(28% 0.12 140)" }}>Export complete</span>
              <span style={{ fontSize: 11, color: "oklch(38% 0.12 140)", fontFamily: FONTS.mono }}>
                {exportPath || "outputs/"} — {completedScenes.length} images + distribution_reference.md
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { ExportScreen });
