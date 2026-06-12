// MappingScreen.jsx - editable AI scene mapping

const ASSET_TYPES = ["INFOGRAPHIC", "BROLL"];

const emptyScene = (id, type = "INFOGRAPHIC") => ({
  id,
  type,
  description: "",
  source_text: "",
  text: null,
  start_time: null,
  end_time: null,
  estimated: true,
  aspect_ratio: "16:9",
  image_count: 1,
  status: "pending",
  image_paths: [],
  attempts: 0,
  score: null,
  prompt: null,
});

const renumberLocal = (list) => list.map((scene, index) => ({
  ...scene,
  id: index + 1,
  status: "pending",
  prompt: null,
}));

const formatSceneTime = (scene) => {
  const start = scene.start_time ? scene.start_time.substring(0, 8) : "--:--:--";
  const end = scene.end_time ? scene.end_time.substring(0, 8) : "--:--:--";
  return `${start} -> ${end}${scene.estimated ? " est." : ""}`;
};

const MappingScreen = ({
  theme,
  accent,
  density,
  chatStyle,
  sessionId,
  initialScenes,
  initialMessages,
  initialApproved,
  onScenesUpdated,
  onMessagesUpdated,
  onNext,
}) => {
  const t = THEMES[theme];
  const a = ACCENTS[accent];
  const [scenes, setScenes] = React.useState(initialScenes || []);
  const [messages, setMessages] = React.useState(initialMessages || []);
  const [input, setInput] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(null);
  const [isApproved, setIsApproved] = React.useState(!!initialApproved);
  const [chatLoading, setChatLoading] = React.useState(false);
  const [approving, setApproving] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const chatEndRef = React.useRef(null);
  const pad = density === "compact" ? 16 : 24;
  const isCardView = chatStyle === "card";

  React.useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const updateMessages = (next) => {
    setMessages(next);
    if (onMessagesUpdated) onMessagesUpdated(next);
  };

  const updateScenes = (next, preferredSelectedId = selectedId) => {
    const numbered = renumberLocal(next);
    setScenes(numbered);
    if (onScenesUpdated) onScenesUpdated(numbered);
    if (!numbered.length) {
      setSelectedId(null);
      return;
    }
    const exists = numbered.some((scene) => scene.id === preferredSelectedId);
    setSelectedId(exists ? preferredSelectedId : numbered[0].id);
  };

  const selectedScene = scenes.find((scene) => scene.id === selectedId) || scenes[0] || null;

  const fetchMapping = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/generate-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Mapping request failed" }));
        throw new Error(err.detail || `Mapping failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (!Array.isArray(data.scenes) || data.scenes.length === 0) {
        throw new Error("Gemini returned no scenes.");
      }
      updateScenes(data.scenes, 1);
      updateMessages([{ role: "assistant", text: data.reply || `Generated ${data.scenes.length} scenes.` }]);
    } catch (e) {
      setError(e.message || "Mapping failed");
    } finally {
      setRegenerating(false);
    }
  };

  React.useEffect(() => {
    if (sessionId && scenes.length === 0) fetchMapping();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveScenes = async (list = scenes) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/update-scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, scenes: renumberLocal(list) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Save failed" }));
        const detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
        throw new Error(detail || "Save failed");
      }
      const data = await res.json();
      updateScenes(data.scenes, selectedId);
      return data.scenes;
    } finally {
      setSaving(false);
    }
  };

  const patchScene = (id, patch) => {
    updateScenes(
      scenes.map((scene) => scene.id === id ? { ...scene, ...patch, prompt: null } : scene),
      id,
    );
  };

  const addSceneAt = (mode) => {
    const draft = emptyScene(scenes.length + 1);
    let index = scenes.length;
    if (mode === "start") index = 0;
    if (mode === "before" && selectedScene) index = scenes.findIndex((scene) => scene.id === selectedScene.id);
    if (mode === "after" && selectedScene) index = scenes.findIndex((scene) => scene.id === selectedScene.id) + 1;
    const next = [...scenes.slice(0, index), draft, ...scenes.slice(index)];
    updateScenes(next, index + 1);
  };

  const deleteScene = (id) => {
    const index = scenes.findIndex((scene) => scene.id === id);
    const next = scenes.filter((scene) => scene.id !== id);
    updateScenes(next, Math.max(1, index));
  };

  const moveScene = (id, direction) => {
    const index = scenes.findIndex((scene) => scene.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= scenes.length) return;
    const next = [...scenes];
    [next[index], next[target]] = [next[target], next[index]];
    updateScenes(next, target + 1);
  };

  const sendMessage = async () => {
    if (!input.trim() || chatLoading || isApproved) return;
    const userMsg = input.trim();
    const nextMessages = [...messages, { role: "user", text: userMsg }];
    setInput("");
    updateMessages(nextMessages);
    setChatLoading(true);
    setError(null);
    try {
      await saveScenes();
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: userMsg }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Chat request failed" }));
        throw new Error(err.detail || "Chat request failed");
      }
      const data = await res.json();
      updateMessages([...nextMessages, { role: "assistant", text: data.reply }]);
      if (data.scenes && data.scenes.length > 0) updateScenes(data.scenes, selectedId);
    } catch (e) {
      updateMessages([...nextMessages, { role: "assistant", text: `Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleApprove = async () => {
    if (approving || scenes.length === 0) return;
    setApproving(true);
    setError(null);
    try {
      const savedScenes = await saveScenes();
      const res = await fetch("/approve-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Approval failed" }));
        throw new Error(err.detail || "Approval failed");
      }
      setIsApproved(true);
      setTimeout(() => onNext && onNext(savedScenes), 250);
    } catch (e) {
      setError(e.message);
    } finally {
      setApproving(false);
    }
  };

  const typeCount = scenes.reduce((acc, scene) => {
    acc[scene.type] = (acc[scene.type] || 0) + 1;
    return acc;
  }, {});

  const SceneRow = ({ scene, compact }) => {
    const active = selectedScene && selectedScene.id === scene.id;
    return (
      <div
        onClick={() => setSelectedId(scene.id)}
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "32px 118px 1fr" : "34px 124px 116px 1fr",
          gap: 10,
          alignItems: compact ? "center" : "start",
          padding: compact ? "10px 12px" : "12px 14px",
          borderBottom: `1px solid ${t.border}`,
          background: active ? (theme === "light" ? a.light : t.bgSubtle) : t.bgSurface,
          borderLeft: `3px solid ${active ? a.main : "transparent"}`,
          cursor: "pointer",
        }}
      >
        <div style={{ color: t.textSoft, fontSize: 11, fontFamily: FONTS.mono }}>
          {String(scene.id).padStart(2, "0")}
        </div>
        <select
          value={scene.type}
          disabled={isApproved}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => patchScene(scene.id, { type: e.target.value })}
          style={{
            width: "100%",
            padding: "5px 7px",
            borderRadius: 6,
            border: `1px solid ${t.border}`,
            background: t.bg,
            color: t.text,
            fontSize: 11,
            fontFamily: FONTS.mono,
          }}
        >
          {ASSET_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        {!compact && (
          <div style={{ fontSize: 10, color: t.textSoft, fontFamily: FONTS.mono, lineHeight: 1.6 }}>
            {formatSceneTime(scene)}
          </div>
        )}
        <textarea
          value={scene.description || ""}
          disabled={isApproved}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => patchScene(scene.id, { description: e.target.value })}
          placeholder={scene.type === "BROLL" ? "Describe the b-roll shot..." : "Describe the infographic..."}
          rows={compact ? 1 : 2}
          style={{
            width: "100%",
            resize: "vertical",
            minHeight: compact ? 32 : 48,
            borderRadius: 7,
            border: `1px solid ${t.border}`,
            background: t.bg,
            color: t.text,
            padding: "7px 9px",
            fontSize: 12,
            lineHeight: 1.45,
            outline: "none",
          }}
        />
      </div>
    );
  };

  const CardView = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {scenes.map((scene) => {
        const active = selectedScene && selectedScene.id === scene.id;
        return (
          <div
            key={scene.id}
            onClick={() => setSelectedId(scene.id)}
            style={{
              borderRadius: 8,
              border: `1px solid ${active ? a.main : t.border}`,
              background: active ? (theme === "light" ? a.light : t.bgSubtle) : t.bgSurface,
              overflow: "hidden",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
              <span style={{ width: 28, color: t.textSoft, fontSize: 11, fontFamily: FONTS.mono }}>
                {String(scene.id).padStart(2, "0")}
              </span>
              <Badge type={scene.type} />
              <span style={{ marginLeft: "auto", color: t.textSoft, fontSize: 10, fontFamily: FONTS.mono }}>
                {formatSceneTime(scene)}
              </span>
            </div>
            <div style={{ padding: "0 12px 12px 50px" }}>
              <textarea
                value={scene.description || ""}
                disabled={isApproved}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => patchScene(scene.id, { description: e.target.value })}
                placeholder={scene.type === "BROLL" ? "Describe the b-roll shot..." : "Describe the infographic..."}
                rows={2}
                style={{
                  width: "100%",
                  resize: "vertical",
                  minHeight: 48,
                  borderRadius: 7,
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  color: t.text,
                  padding: "7px 9px",
                  fontSize: 12,
                  lineHeight: 1.45,
                  outline: "none",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  const EditorPanel = () => {
    if (!selectedScene) {
      return (
        <div style={{ padding: 16, color: t.textSoft, fontSize: 12 }}>
          Select a scene to edit it.
        </div>
      );
    }

    const index = scenes.findIndex((scene) => scene.id === selectedScene.id);

    return (
      <div style={{ padding: `${pad}px`, borderBottom: `1px solid ${t.border}`, background: t.bgSurface }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: t.textSoft, fontFamily: FONTS.mono }}>
            Scene {String(selectedScene.id).padStart(2, "0")}
          </div>
          <Badge type={selectedScene.type} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <Btn small variant="secondary" icon="plus" theme={theme} accent={accent} onClick={() => addSceneAt("before")} disabled={isApproved}>
              Before
            </Btn>
            <Btn small variant="secondary" icon="plus" theme={theme} accent={accent} onClick={() => addSceneAt("after")} disabled={isApproved}>
              After
            </Btn>
            <Btn small variant="danger" icon="trash" theme={theme} accent={accent} onClick={() => deleteScene(selectedScene.id)} disabled={isApproved || scenes.length <= 1}>
              Delete
            </Btn>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 10, color: t.textSoft, fontWeight: 700, letterSpacing: "0.04em" }}>
            TYPE
            <select
              value={selectedScene.type}
              disabled={isApproved}
              onChange={(e) => patchScene(selectedScene.id, { type: e.target.value })}
              style={{ padding: "8px 9px", borderRadius: 7, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 12, fontFamily: FONTS.mono }}
            >
              {ASSET_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 10, color: t.textSoft, fontWeight: 700, letterSpacing: "0.04em" }}>
            RATIO
            <select
              value={selectedScene.aspect_ratio || "16:9"}
              disabled={isApproved}
              onChange={(e) => patchScene(selectedScene.id, { aspect_ratio: e.target.value })}
              style={{ padding: "8px 9px", borderRadius: 7, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 12, fontFamily: FONTS.mono }}
            >
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          {["start_time", "end_time"].map((key) => (
            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 10, color: t.textSoft, fontWeight: 700, letterSpacing: "0.04em" }}>
              {key === "start_time" ? "START" : "END"}
              <input
                value={selectedScene[key] || ""}
                disabled={isApproved}
                onChange={(e) => patchScene(selectedScene.id, { [key]: e.target.value || null })}
                placeholder="00:00:12,000"
                style={{ padding: "8px 9px", borderRadius: 7, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 12, fontFamily: FONTS.mono }}
              />
            </label>
          ))}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, color: t.textSoft, fontSize: 11 }}>
          <input
            type="checkbox"
            checked={!!selectedScene.estimated}
            disabled={isApproved}
            onChange={(e) => patchScene(selectedScene.id, { estimated: e.target.checked })}
          />
          Estimated timestamp
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 10, color: t.textSoft, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 10 }}>
          DESCRIPTION
          <textarea
            value={selectedScene.description || ""}
            disabled={isApproved}
            onChange={(e) => patchScene(selectedScene.id, { description: e.target.value })}
            rows={4}
            style={{ width: "100%", resize: "vertical", borderRadius: 7, border: `1px solid ${t.border}`, background: t.bg, color: t.text, padding: "8px 10px", fontSize: 12, lineHeight: 1.55, outline: "none" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 10, color: t.textSoft, fontWeight: 700, letterSpacing: "0.04em" }}>
          SOURCE LINE
          <textarea
            value={selectedScene.source_text || ""}
            disabled={isApproved}
            onChange={(e) => patchScene(selectedScene.id, { source_text: e.target.value })}
            rows={3}
            style={{ width: "100%", resize: "vertical", borderRadius: 7, border: `1px solid ${t.border}`, background: t.bg, color: t.text, padding: "8px 10px", fontSize: 12, lineHeight: 1.55, outline: "none", fontFamily: FONTS.mono }}
          />
        </label>

        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <Btn small variant="secondary" theme={theme} accent={accent} onClick={() => moveScene(selectedScene.id, -1)} disabled={isApproved || index <= 0}>
            Move up
          </Btn>
          <Btn small variant="secondary" theme={theme} accent={accent} onClick={() => moveScene(selectedScene.id, 1)} disabled={isApproved || index >= scenes.length - 1}>
            Move down
          </Btn>
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: t.bg, overflow: "hidden" }}>
      <TopBar
        title="Scene Mapping"
        subtitle={`${scenes.length} scenes - ${(typeCount.INFOGRAPHIC || 0)} infographics, ${(typeCount.BROLL || 0)} b-roll`}
        theme={theme}
        accent={accent}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" icon="plus" theme={theme} accent={accent} onClick={() => addSceneAt("start")} disabled={isApproved}>
              Add start
            </Btn>
            <Btn variant="secondary" icon="plus" theme={theme} accent={accent} onClick={() => addSceneAt("end")} disabled={isApproved}>
              Add end
            </Btn>
            <Btn variant="secondary" icon="refresh" theme={theme} accent={accent} onClick={fetchMapping} disabled={regenerating || isApproved}>
              {regenerating ? "Generating..." : "Regenerate draft"}
            </Btn>
            <Btn variant="primary" icon="lock" theme={theme} accent={accent} onClick={handleApprove} disabled={approving || saving || scenes.length === 0 || regenerating}>
              {approving || saving ? "Saving..." : "Approve Plan"}
            </Btn>
          </div>
        }
      />

      <div style={{ display: "flex", gap: 6, padding: `8px ${pad}px`, background: t.bgSurface, borderBottom: `1px solid ${t.border}`, alignItems: "center" }}>
        {ASSET_TYPES.map((type) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Badge type={type} />
            <span style={{ fontSize: 11, color: t.textSoft, fontFamily: FONTS.mono }}>{typeCount[type] || 0}</span>
          </div>
        ))}
        {isApproved && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: "oklch(35% 0.12 140)", background: "oklch(93% 0.07 140)", padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
            <Icon name="lock" size={11} color="oklch(35% 0.12 140)" />
            Locked
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: "0 0 62%", display: "flex", flexDirection: "column", overflow: "hidden", borderRight: `1px solid ${t.border}` }}>
          {error && (
            <div style={{ margin: `${pad}px ${pad}px 0`, padding: "10px 14px", borderRadius: 8, background: "oklch(94% 0.08 20)", border: "1px solid oklch(80% 0.1 20)", fontSize: 12, color: "oklch(35% 0.14 20)", display: "flex", gap: 8, alignItems: "center" }}>
              <Icon name="alertTriangle" size={13} color="oklch(45% 0.16 20)" />
              {error}
            </div>
          )}

          <div style={{ flex: 1, overflow: "auto", padding: `${pad}px` }}>
            {scenes.length > 0 ? (
              isCardView ? (
                <CardView />
              ) : (
                <div style={{ borderRadius: 8, border: `1px solid ${t.border}`, overflow: "hidden", background: t.bgSurface }}>
                  <div style={{ display: "grid", gridTemplateColumns: "34px 124px 116px 1fr", gap: 10, padding: "8px 14px", background: t.bgSubtle, borderBottom: `1px solid ${t.border}` }}>
                    {["#", "Type", "Time", "Editable scene description"].map((label) => (
                      <div key={label} style={{ fontSize: 10, fontWeight: 700, color: t.textSoft, letterSpacing: "0.06em" }}>{label}</div>
                    ))}
                  </div>
                  {scenes.map((scene) => <SceneRow key={scene.id} scene={scene} />)}
                </div>
              )
            ) : regenerating ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: t.textSoft, fontSize: 13 }}>
                Generating scene plan with Gemini...
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: t.textSoft, fontSize: 13 }}>
                No scenes yet.
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <EditorPanel />

          <div style={{ flex: 1, overflow: "auto", padding: `${pad}px` }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "assistant" && (
                    <div style={{ width: 26, height: 26, borderRadius: 8, background: a.main, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                      <Icon name="sparkle" size={12} color="#fff" />
                    </div>
                  )}
                  <div style={{
                    maxWidth: "82%",
                    padding: "9px 12px",
                    borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "2px 12px 12px 12px",
                    background: msg.role === "user" ? a.main : t.bgSurface,
                    border: msg.role === "assistant" ? `1px solid ${t.border}` : "none",
                    color: msg.role === "user" ? "#fff" : t.text,
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: a.main, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 8 }}>
                    <Icon name="sparkle" size={12} color="#fff" />
                  </div>
                  <div style={{ padding: "9px 12px", borderRadius: "2px 12px 12px 12px", background: t.bgSurface, border: `1px solid ${t.border}`, color: t.textSoft, fontSize: 12 }}>
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          <div style={{ padding: `12px ${pad}px`, borderTop: `1px solid ${t.border}`, background: t.bgSurface }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder='Ask AI to edit the plan, e.g. "split scene 4 into a b-roll intro and infographic payoff"'
                rows={2}
                disabled={chatLoading || regenerating || isApproved}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  resize: "none",
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  color: t.text,
                  fontSize: 12,
                  outline: "none",
                  lineHeight: 1.5,
                  opacity: (chatLoading || regenerating || isApproved) ? 0.6 : 1,
                }}
              />
              <button
                onClick={sendMessage}
                disabled={chatLoading || !input.trim() || regenerating || isApproved}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: "none",
                  background: a.main,
                  cursor: (chatLoading || regenerating || isApproved) ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  opacity: (chatLoading || !input.trim() || regenerating || isApproved) ? 0.5 : 1,
                }}
              >
                <Icon name="send" size={14} color="#fff" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { MappingScreen });
