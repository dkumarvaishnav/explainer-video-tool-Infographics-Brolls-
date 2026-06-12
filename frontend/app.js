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

  React.useEffect(() => localStorage.setItem("theme", theme), [theme]);
  React.useEffect(() => localStorage.setItem("accent", accent), [accent]);
  React.useEffect(() => localStorage.setItem("density", density), [density]);
  React.useEffect(() => localStorage.setItem("chatStyle", chatStyle), [chatStyle]);

  const handleUploadNext = (sid, pName) => {
    setSessionId(sid);
    setProjectName(pName);
    setMappingScenes([]);
    setMappingMessages([]);
    setPromptScenes([]);
    setMappingLocked(false);
    setPhase("mapping");
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
    if (sessionId && targetIndex <= currentPhaseIndex) {
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
      />
    ),
    prompts: (
      <PromptScreen
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
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{
          height: 32,
          background: t.bgSurface,
          borderBottom: `1px solid ${t.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 16px",
          gap: 12,
          flexShrink: 0,
        }}>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: t.textSoft,
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {["teal", "violet", "amber"].map((ac) => (
              <button
                key={ac}
                onClick={() => setAccent(ac)}
                title={ac}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: ACCENTS[ac].main,
                  border: accent === ac ? `2px solid ${t.text}` : "2px solid transparent",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>

          {phase === "mapping" && (
            <button
              onClick={() => setChatStyle(chatStyle === "card" ? "table" : "card")}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: t.textSoft,
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {chatStyle === "card" ? "Table view" : "Card view"}
            </button>
          )}

          <button
            onClick={() => setSidebarCompact(!sidebarCompact)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: t.textSoft,
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            {sidebarCompact ? "Expand sidebar" : "Collapse sidebar"}
          </button>
        </div>

        {screens[phase] || screens.upload}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<AppShell />);
