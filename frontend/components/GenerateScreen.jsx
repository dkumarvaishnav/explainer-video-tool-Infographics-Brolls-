
// GenerateScreen.jsx — Phase 5: Generation progress

const ScoreBar = ({ score, theme }) => {
  const t = THEMES[theme];
  if (score === null || score === undefined) return <span style={{ fontSize: 11, color: t.textSoft, fontFamily: FONTS.mono }}>—</span>;
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "oklch(55% 0.14 140)" : score >= 7 ? "oklch(62% 0.14 72)" : "oklch(55% 0.16 20)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: t.bgSubtle, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: FONTS.mono, color, fontWeight: 600, flexShrink: 0 }}>{score.toFixed(1)}</span>
    </div>
  );
};

const SpinnerDot = ({ color }) => {
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    const i = setInterval(() => setFrame(f => (f + 1) % 3), 400);
    return () => clearInterval(i);
  }, []);
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center", flexShrink: 0 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 4, height: 4, borderRadius: "50%",
          background: color,
          opacity: frame === i ? 1 : 0.25,
          transition: "opacity 0.2s ease",
        }} />
      ))}
    </div>
  );
};

const GenerateScreen = ({ theme, accent, density, sessionId, styleName, onNext }) => {
  const t = THEMES[theme];
  const a = ACCENTS[accent];
  const [scenes, setScenes] = React.useState([]);
  const [status, setStatus] = React.useState("idle");
  const [batchSize, setBatchSize] = React.useState(1);
  const [started, setStarted] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [completedCount, setCompletedCount] = React.useState(0);
  const [failedScenes, setFailedScenes] = React.useState([]);
  const pollRef = React.useRef(null);
  const pad = density === "compact" ? 16 : 24;

  const totalScenes = scenes.length;
  const completed = scenes.filter(s => s.status === "completed").length;
  const failed = scenes.filter(s => s.status === "failed").length;
  const isAllDone = totalScenes > 0 && completed + failed === totalScenes;
  const pct = totalScenes > 0 ? Math.round((completed / totalScenes) * 100) : 0;

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/status?session_id=${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        setScenes(data.scenes || []);
        setStatus(data.status);
        setCompletedCount(data.completed_scenes || 0);
        setFailedScenes(data.failed_scenes || []);
        if (data.status === "paused") setPaused(true);
        if (data.status !== "running") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setRunning(false);
        }
      } catch (e) {
        // ignore poll errors
      }
    }, 2000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  React.useEffect(() => {
    return () => stopPolling();
  }, []);

  const handleStart = async () => {
    if (started) return;
    setError(null);
    try {
      const res = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, batch_size: batchSize }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to start generation");
      }
      setStarted(true);
      setRunning(true);
      setPaused(false);
      startPolling();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleStop = async () => {
    setError(null);
    try {
      const res = await fetch("/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to stop");
      }
      setRunning(false);
      stopPolling();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleResume = async (mode) => {
    setError(null);
    try {
      const res = await fetch("/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, mode }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to resume");
      }
      setRunning(true);
      setPaused(false);
      startPolling();
    } catch (e) {
      setError(e.message);
    }
  };

  // Auto-start on mount
  React.useEffect(() => {
    if (sessionId && !started) {
      handleStart();
    }
  }, [sessionId]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: t.bg, overflow: "hidden" }}>
      <TopBar
        title="Generating Images"
        subtitle={`${completed} of ${totalScenes} scenes complete · Style: ${styleName || "Selected Style"}`}
        theme={theme} accent={accent}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {running ? (
              <Btn variant="danger" theme={theme} accent={accent} onClick={handleStop}>
                Stop
              </Btn>
            ) : started && !isAllDone ? (
              <>
                <Btn variant="secondary" theme={theme} accent={accent} icon="refresh" onClick={() => handleResume("from_current")}>
                  Resume from current
                </Btn>
                <Btn variant="secondary" theme={theme} accent={accent} onClick={() => handleResume("from_start")}>
                  Resume from start
                </Btn>
              </>
            ) : null}
            {isAllDone && (
              <Btn variant="primary" icon="chevronRight" theme={theme} accent={accent} onClick={() => onNext && onNext(scenes)}>
                Export
              </Btn>
            )}
          </div>
        }
      />

      {/* Progress bar */}
      <div style={{
        padding: `10px ${pad}px`,
        background: t.bgSurface, borderBottom: `1px solid ${t.border}`,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <span style={{ fontSize: 11, color: t.textSoft }}>
              <span style={{ color: "oklch(55% 0.14 140)", fontWeight: 600 }}>{completed}</span> completed
            </span>
            {running && (
              <span style={{ fontSize: 11, color: t.textSoft }}>
                <span style={{ color: "oklch(62% 0.14 72)", fontWeight: 600 }}>
                  {scenes.filter(s => s.status === "generating").length}
                </span> generating
              </span>
            )}
            {failed > 0 && (
              <span style={{ fontSize: 11, color: t.textSoft }}>
                <span style={{ color: "oklch(55% 0.16 20)", fontWeight: 600 }}>{failed}</span> failed
              </span>
            )}
            <span style={{ fontSize: 11, color: t.textSoft }}>
              <span style={{ fontWeight: 600, color: t.textMid }}>
                {scenes.filter(s => s.status === "pending").length}
              </span> pending
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: t.textSoft }}>Batch:</span>
            {[1, 5, 10].map(n => (
              <button
                key={n}
                onClick={() => setBatchSize(n)}
                disabled={started}
                style={{
                  padding: "2px 8px", borderRadius: 4, border: `1px solid ${batchSize === n ? a.main : t.border}`,
                  background: batchSize === n ? a.light : "transparent",
                  color: batchSize === n ? a.text : t.textSoft,
                  fontSize: 11, fontFamily: FONTS.mono, cursor: started ? "not-allowed" : "pointer",
                  fontWeight: batchSize === n ? 600 : 400,
                  opacity: started ? 0.6 : 1,
                }}
              >{n}</button>
            ))}
          </div>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: t.bgSubtle, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: a.main, borderRadius: 3, transition: "width 0.5s ease" }} />
        </div>
      </div>

      {/* Scene list */}
      <div style={{ flex: 1, overflow: "auto", padding: `${pad}px` }}>
        {error && (
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "oklch(94% 0.08 20)", border: "1px solid oklch(80% 0.1 20)", fontSize: 12, color: "oklch(35% 0.14 20)", display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="alertTriangle" size={13} color="oklch(45% 0.16 20)" />
            {error}
          </div>
        )}

        {scenes.length > 0 ? (
          <div style={{ background: t.bgSurface, borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden" }}>
            {/* Header */}
            <div style={{
              display: "flex",
              padding: "8px 16px",
              borderBottom: `1px solid ${t.border}`,
              background: t.bgSubtle,
              gap: 0,
            }}>
              {[
                { label: "#",          w: 28 },
                { label: "Type",       w: 110 },
                { label: "Description", flex: 1 },
                { label: "Status",     w: 100 },
                { label: "Score",      w: 88 },
                { label: "Attempts",   w: 70 },
              ].map(h => (
                <div key={h.label} style={{
                  fontSize: 10, fontWeight: 700, color: t.textSoft, letterSpacing: "0.06em",
                  width: h.w, flex: h.flex || undefined, flexShrink: 0,
                }}>{h.label}</div>
              ))}
            </div>

            {scenes.map((scene, i) => {
              const isGenerating = scene.status === "generating";
              const isFailed     = scene.status === "failed";
              const isReview     = scene.status === "needs_review";

              return (
                <div
                  key={scene.id}
                  style={{
                    display: "flex",
                    padding: "10px 16px",
                    borderBottom: i < scenes.length - 1 ? `1px solid ${t.border}` : "none",
                    alignItems: "center",
                    gap: 0,
                    background: isGenerating
                      ? (theme === "light" ? "oklch(98% 0.04 72)" : "oklch(18% 0.02 72)")
                      : isFailed
                      ? (theme === "light" ? "oklch(98% 0.04 20)" : "oklch(18% 0.02 20)")
                      : isReview
                      ? (theme === "light" ? "oklch(98% 0.04 60)" : "oklch(18% 0.02 60)")
                      : "transparent",
                    transition: "background 0.3s ease",
                    minWidth: 0,
                  }}
                >
                  <div style={{ width: 28, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: t.textSoft, fontFamily: FONTS.mono }}>
                      {String(scene.id).padStart(2, "0")}
                    </span>
                  </div>
                  <div style={{ width: 110, flexShrink: 0 }}>
                    <Badge type={scene.type} />
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0, paddingRight: 12 }}>
                    <span style={{ fontSize: 11, color: t.text, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {scene.description}
                    </span>
                    {isGenerating && <SpinnerDot color={a.main} />}
                  </div>
                  <div style={{ width: 100, flexShrink: 0 }}>
                    <StatusBadge status={scene.status} />
                  </div>
                  <div style={{ width: 88, flexShrink: 0 }}>
                    <ScoreBar score={scene.score} theme={theme} />
                  </div>
                  <div style={{ width: 70, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: scene.attempts > 1 ? "oklch(58% 0.14 72)" : t.textSoft, fontFamily: FONTS.mono }}>
                      {scene.attempts > 0 ? `${scene.attempts}×` : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200, color: t.textSoft, fontSize: 13 }}>
            {started ? "Starting generation…" : "Initializing…"}
          </div>
        )}

        {/* Scoring info */}
        <div style={{
          marginTop: 14, padding: "10px 14px", borderRadius: 8,
          background: t.bgSubtle, border: `1px solid ${t.border}`,
          display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <Icon name="info" size={13} color={t.textSoft} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: t.textSoft, lineHeight: 1.6 }}>
            Scoring threshold: 7.5. Auto-regenerates up to 3× per scene. On 2nd failure, pipeline pauses for review.
            Scores are hidden per-scene until generation completes.
          </span>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { GenerateScreen });
