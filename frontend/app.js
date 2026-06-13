// app.js - Main application shell

const AppShell = () => {
  const [theme, setTheme] = React.useState(() => localStorage.getItem("theme") || "dark");
  const [accent, setAccent] = React.useState(() => localStorage.getItem("accent") || "teal");
  const [density, setDensity] = React.useState(() => localStorage.getItem("density") || "normal");
  const [chatStyle, setChatStyle] = React.useState(() => localStorage.getItem("chatStyle") || "card");
  const [sidebarCompact, setSidebarCompact] = React.useState(false);

  const [sessionId, setSessionId] = React.useState(null);
  const [projectName, setProjectName] = React.useState(null);
  const [phase, setPhase] = React.useState("upload");
  const [mappingScenes, setMappingScenes] = React.useState([]);
  const [mappingMessages, setMappingMessages] = React.useState([]);
  const [promptScenes, setPromptScenes] = React.useState([]);
  const [mappingLocked, setMappingLocked] = React.useState(false);
  const [sessions, setSessions] = React.useState([]);
  const [sidebarWidth, setSidebarWidth] = React.useState(300);
  const [isResizingSidebar, setIsResizingSidebar] = React.useState(false);

  const startResizingSidebar = (mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizingSidebar(true);
    const startX = mouseDownEvent.clientX;
    const startWidth = sidebarWidth;

    const doDrag = (mouseMoveEvent) => {
      const newWidth = Math.max(180, Math.min(480, startWidth + (mouseMoveEvent.clientX - startX)));
      setSidebarWidth(newWidth);
    };

    const stopDrag = () => {
      setIsResizingSidebar(false);
      window.removeEventListener('mousemove', doDrag);
      window.removeEventListener('mouseup', stopDrag);
    };

    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);
  };

  React.useEffect(() => localStorage.setItem("theme", theme), [theme]);
  React.useEffect(() => localStorage.setItem("accent", accent), [accent]);
  React.useEffect(() => localStorage.setItem("density", density), [density]);
  React.useEffect(() => localStorage.setItem("chatStyle", chatStyle), [chatStyle]);

  const fetchSessions = async () => {
    try {
      const res = await fetch("/sessions?_t=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (e) {
      console.error("Failed to fetch sessions", e);
    }
  };

  React.useEffect(() => {
    fetchSessions();
  }, []);

  const handleUploadNext = (sid, pName) => {
    setSessionId(sid);
    setProjectName(pName);
    setMappingScenes([]);
    setMappingMessages([]);
    setPromptScenes([]);
    setMappingLocked(false);
    setPhase("mapping");
    fetchSessions();
  };

  const handleLoadSession = async (sid) => {
    try {
      const res = await fetch(`/sessions/${sid}`);
      if (!res.ok) throw new Error("Failed to load session");
      const data = await res.json();
      const s = data.session;

      setSessionId(s.session_id);
      setProjectName(s.project_name);
      setMappingScenes(s.scenes || []);
      setPromptScenes(s.scenes || []);
      setMappingLocked(s.approved || false);

      const msgs = (s.chat_history || []).map((m) => ({
        role: m.role,
        text: m.text,
      }));
      setMappingMessages(msgs);

      if (s.approved || (s.scenes && s.scenes.some((scene) => scene.prompt))) {
        setPhase("prompts");
      } else if (s.scenes && s.scenes.length > 0) {
        setPhase("mapping");
      } else {
        setPhase("upload");
      }
      await fetchSessions();
    } catch (err) {
      alert("Error loading session: " + err.message);
    }
  };

  const handleDeleteSession = async (sid) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      const res = await fetch(`/sessions/${sid}`, { method: "DELETE" });
      if (res.ok) {
        fetchSessions();
        if (sessionId === sid) {
          setSessionId(null);
          setProjectName(null);
          setPhase("upload");
          setMappingScenes([]);
          setMappingMessages([]);
          setPromptScenes([]);
          setMappingLocked(false);
        }
      }
    } catch (err) {
      console.error("Failed to delete session", err);
    }
  };

  const handleMappingNext = (scenes) => {
    if (scenes) {
      setMappingScenes(scenes);
      setPromptScenes(scenes);
    }
    setMappingLocked(true);
    setPhase("prompts");
  };

  const phaseOrder = ["upload", "mapping", "prompts"];
  const currentPhaseIndex = phaseOrder.indexOf(phase);

  const handlePhaseClick = (targetPhase) => {
    const targetIndex = phaseOrder.indexOf(targetPhase);
    const maxPhaseIndex = mappingLocked ? 2 : currentPhaseIndex;
    if (sessionId && targetIndex <= maxPhaseIndex) {
      setPhase(targetPhase);
    }
  };

  const t = THEMES[theme];

  const screens = {
    upload: (
      <UploadScreen
        theme={theme}
        accent={accent}
        density={density}
        onNext={handleUploadNext}
      />
    ),
    mapping: (
      <MappingScreen
        key={sessionId}
        theme={theme}
        accent={accent}
        density={density}
        chatStyle={chatStyle}
        sessionId={sessionId}
        initialScenes={mappingScenes}
        initialMessages={mappingMessages}
        initialApproved={mappingLocked}
        onScenesUpdated={setMappingScenes}
        onMessagesUpdated={setMappingMessages}
        onNext={handleMappingNext}
        onLoadSession={handleLoadSession}
      />
    ),
    prompts: (
      <PromptScreen
        key={sessionId}
        theme={theme}
        accent={accent}
        density={density}
        sessionId={sessionId}
        projectName={projectName}
        initialScenes={promptScenes.length ? promptScenes : mappingScenes}
        onScenesUpdated={setPromptScenes}
      />
    ),
  };

  return (
    <div style={{ display: "flex", height: "100%", width: "100%", overflow: "hidden", fontFamily: FONTS.sansSerif }}>
      <PhaseSidebar
        activePhase={phase}
        theme={theme}
        accent={accent}
        onPhaseClick={handlePhaseClick}
        compact={sidebarCompact}
        sessions={sessions}
        activeSessionId={sessionId}
        onSessionSelect={handleLoadSession}
        onSessionDelete={handleDeleteSession}
        onToggleCompact={() => setSidebarCompact(!sidebarCompact)}
        setTheme={setTheme}
        setAccent={setAccent}
        chatStyle={chatStyle}
        setChatStyle={setChatStyle}
        style={{ width: sidebarCompact ? 56 : sidebarWidth, transition: isResizingSidebar ? "none" : "width 0.2s ease" }}
      />

      {!sidebarCompact && (
        <div
          onMouseDown={startResizingSidebar}
          style={{
            width: "4px",
            background: isResizingSidebar ? ACCENTS[accent].main : "transparent",
            cursor: "col-resize",
            zIndex: 100,
            flexShrink: 0,
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => e.target.style.background = ACCENTS[accent].main}
          onMouseLeave={(e) => { if (!isResizingSidebar) e.target.style.background = "transparent"; }}
        />
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {screens[phase] || screens.upload}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<AppShell />);
