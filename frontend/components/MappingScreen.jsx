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
  const [panelOrder, setPanelOrder] = React.useState(["scenes", "info", "chat"]);
  const [draggedPanelId, setDraggedPanelId] = React.useState(null);
  const [draggedOverIndex, setDraggedOverIndex] = React.useState(null);
  const [reprocessingId, setReprocessingId] = React.useState(null);
  const [isInfoOpen, setIsInfoOpen] = React.useState(false);
  const [isChatOpen, setIsChatOpen] = React.useState(true);
  const [typeFilter, setTypeFilter] = React.useState(null);
  const [infoDockMode, setInfoDockMode] = React.useState("column"); // "column" | "scenes-top" | "scenes-bottom" | "chat-top" | "chat-bottom"
  const [colWidths3, setColWidths3] = React.useState([33.33, 33.33, 33.33]);
  const [colWidths2, setColWidths2] = React.useState([50, 50]);
  const [scenesRowRatio, setScenesRowRatio] = React.useState(50);
  const [chatRowRatio, setChatRowRatio] = React.useState(50);
  const [dragOverlayStyle, setDragOverlayStyle] = React.useState(null);
  const chatEndRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const pad = density === "compact" ? 16 : 24;
  const isCardView = chatStyle === "card";

  const handleSceneClick = (id) => {
    if (selectedId === id) {
      setIsInfoOpen(!isInfoOpen);
    } else {
      setSelectedId(id);
      setIsInfoOpen(true);
    }
  };

  const effectiveDockMode = React.useMemo(() => {
    if (infoDockMode.startsWith("chat-") && !isChatOpen) {
      return "column";
    }
    return infoDockMode;
  }, [infoDockMode, isChatOpen]);

  const activeColumns = React.useMemo(() => {
    if (effectiveDockMode === "column") {
      return panelOrder.filter(id => {
        if (id === "scenes") return true;
        if (id === "info") return isInfoOpen;
        if (id === "chat") return isChatOpen;
        return false;
      });
    } else {
      return panelOrder.filter(id => id === "scenes" || (id === "chat" && isChatOpen));
    }
  }, [panelOrder, effectiveDockMode, isInfoOpen, isChatOpen]);

  const startResizingColumns = (mouseDownEvent, colIdx) => {
    mouseDownEvent.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = mouseDownEvent.clientX;

    const isThree = (activeColumns.length === 3);
    const currentWidths = isThree ? [...colWidths3] : [...colWidths2];

    const doDrag = (mouseMoveEvent) => {
      const deltaX = mouseMoveEvent.clientX - startX;
      const deltaPct = (deltaX / rect.width) * 100;

      const newWidths = [...currentWidths];
      const wLeft = currentWidths[colIdx] + deltaPct;
      const wRight = currentWidths[colIdx + 1] - deltaPct;

      if (wLeft > 15 && wRight > 15) {
        newWidths[colIdx] = wLeft;
        newWidths[colIdx + 1] = wRight;
        if (isThree) {
          setColWidths3(newWidths);
        } else {
          setColWidths2(newWidths);
        }
      }
    };

    const stopDrag = () => {
      window.removeEventListener('mousemove', doDrag);
      window.removeEventListener('mouseup', stopDrag);
    };

    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);
  };

  const startResizingRow = (mouseDownEvent, columnId) => {
    mouseDownEvent.preventDefault();
    const columnEl = document.getElementById(`column-${columnId}`);
    if (!columnEl) return;
    const rect = columnEl.getBoundingClientRect();
    const startY = mouseDownEvent.clientY;
    const currentRatio = columnId === "scenes" ? scenesRowRatio : chatRowRatio;

    const doDrag = (mouseMoveEvent) => {
      const deltaY = mouseMoveEvent.clientY - startY;
      const deltaPct = (deltaY / rect.height) * 100;

      const newRatio = Math.max(15, Math.min(85, currentRatio + deltaPct));
      if (columnId === "scenes") {
        setScenesRowRatio(newRatio);
      } else {
        setChatRowRatio(newRatio);
      }
    };

    const stopDrag = () => {
      window.removeEventListener('mousemove', doDrag);
      window.removeEventListener('mouseup', stopDrag);
    };

    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);
  };

  const startDraggingPanelHeader = (mouseDownEvent, panelId) => {
    if (mouseDownEvent.button !== 0) return;
    if (
      mouseDownEvent.target.closest('button') ||
      mouseDownEvent.target.closest('select') ||
      mouseDownEvent.target.closest('input') ||
      mouseDownEvent.target.closest('textarea')
    ) {
      return;
    }
    mouseDownEvent.preventDefault();
    setDraggedPanelId(panelId);

    const isInfoOpenAtStart = isInfoOpen;
    const isChatOpenAtStart = isChatOpen;
    const infoDockModeAtStart = infoDockMode;
    const activeColumnsAtStart = infoDockMode === "column"
      ? panelOrder.filter(id => (id === "scenes") || (id === "info" && isInfoOpen) || (id === "chat" && isChatOpen))
      : panelOrder.filter(id => id === "scenes" || (id === "chat" && isChatOpen));

    let currentTarget = null;

    const doDrag = (mouseMoveEvent) => {
      const x = mouseMoveEvent.clientX;
      const y = mouseMoveEvent.clientY;
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();

      const scenesEl = document.getElementById("column-scenes");
      const chatEl = document.getElementById("column-chat");

      let target = null;
      let style = null;

      const isInside = (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

      if (panelId === "info") {
        if (scenesEl && isInside(scenesEl.getBoundingClientRect())) {
          const rect = scenesEl.getBoundingClientRect();
          const relativeY = y - rect.top;
          const pct = relativeY / rect.height;
          if (pct < 0.2) {
            target = { type: "split", target: "scenes", pos: "top" };
            style = {
              left: rect.left - containerRect.left,
              top: rect.top - containerRect.top,
              width: rect.width,
              height: rect.height * 0.5,
            };
          } else if (pct > 0.8) {
            target = { type: "split", target: "scenes", pos: "bottom" };
            style = {
              left: rect.left - containerRect.left,
              top: rect.top - containerRect.top + rect.height * 0.5,
              width: rect.width,
              height: rect.height * 0.5,
            };
          }
        } else if (chatEl && isInside(chatEl.getBoundingClientRect()) && isChatOpenAtStart) {
          const rect = chatEl.getBoundingClientRect();
          const relativeY = y - rect.top;
          const pct = relativeY / rect.height;
          if (pct < 0.2) {
            target = { type: "split", target: "chat", pos: "top" };
            style = {
              left: rect.left - containerRect.left,
              top: rect.top - containerRect.top,
              width: rect.width,
              height: rect.height * 0.5,
            };
          } else if (pct > 0.8) {
            target = { type: "split", target: "chat", pos: "bottom" };
            style = {
              left: rect.left - containerRect.left,
              top: rect.top - containerRect.top + rect.height * 0.5,
              width: rect.width,
              height: rect.height * 0.5,
            };
          }
        }
      }

      if (!target) {
        const isInfoDragging = panelId === "info";
        const isInfoColumn = activeColumnsAtStart.includes("info");
        const targetCount = (isInfoDragging && !isInfoColumn) ? activeColumnsAtStart.length + 1 : activeColumnsAtStart.length;
        const relativeX = x - containerRect.left;
        const fraction = relativeX / containerRect.width;
        const index = Math.max(0, Math.min(targetCount - 1, Math.floor(fraction * targetCount)));

        const colWidth = containerRect.width / targetCount;
        target = { type: "column", index: index };
        style = {
          left: index * colWidth + 8,
          top: 8,
          width: colWidth - 16,
          height: containerRect.height - 16,
        };
      }

      currentTarget = target;
      setDragOverlayStyle(style);
      setDraggedOverIndex(target);
    };

    const stopDrag = (mouseUpEvent) => {
      let target = currentTarget;
      const container = containerRef.current;
      if (container && target === null) {
        const x = mouseUpEvent.clientX;
        const containerRect = container.getBoundingClientRect();
        const isInfoDragging = panelId === "info";
        const isInfoColumn = activeColumnsAtStart.includes("info");
        const targetCount = (isInfoDragging && !isInfoColumn) ? activeColumnsAtStart.length + 1 : activeColumnsAtStart.length;
        const relativeX = x - containerRect.left;
        const fraction = relativeX / containerRect.width;
        const index = Math.max(0, Math.min(targetCount - 1, Math.floor(fraction * targetCount)));
        target = { type: "column", index: index };
      }

      if (target) {
        if (panelId === "info") {
          if (target.type === "split") {
            setInfoDockMode(`${target.target}-${target.pos}`);
          } else if (target.type === "column") {
            setInfoDockMode("column");
            setPanelOrder(prevOrder => {
              const activeOrder = prevOrder.filter(id => {
                if (id === "scenes") return true;
                if (id === "info") return isInfoOpenAtStart;
                if (id === "chat") return isChatOpenAtStart;
                return false;
              });
              const targetPanelId = activeOrder[target.index];
              const newOrder = [...prevOrder];
              const dragIdx = newOrder.indexOf(panelId);
              const targetIdx = newOrder.indexOf(targetPanelId);
              if (dragIdx !== -1 && targetIdx !== -1) {
                newOrder[dragIdx] = targetPanelId;
                newOrder[targetIdx] = panelId;
              }
              return newOrder;
            });
          }
        } else {
          if (target.type === "column") {
            setPanelOrder(prevOrder => {
              const activeOrder = prevOrder.filter(id => {
                if (id === "scenes") return true;
                if (id === "info") return isInfoOpenAtStart && infoDockModeAtStart === "column";
                if (id === "chat") return isChatOpenAtStart;
                return false;
              });
              const targetPanelId = activeOrder[target.index];
              const newOrder = [...prevOrder];
              const dragIdx = newOrder.indexOf(panelId);
              const targetIdx = newOrder.indexOf(targetPanelId);
              if (dragIdx !== -1 && targetIdx !== -1) {
                newOrder[dragIdx] = targetPanelId;
                newOrder[targetIdx] = panelId;
              }
              return newOrder;
            });
          }
        }
      }

      setDraggedPanelId(null);
      setDraggedOverIndex(null);
      setDragOverlayStyle(null);
      window.removeEventListener('mousemove', doDrag);
      window.removeEventListener('mouseup', stopDrag);
    };

    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);
  };

  const renderScenesPanelContent = () => (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: t.bgSurface,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        overflow: "hidden",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        onMouseDown={(e) => startDraggingPanelHeader(e, "scenes")}
        style={{
          height: 40,
          padding: "0 12px",
          background: t.bgSubtle,
          borderBottom: `1px solid ${t.border}`,
          display: "flex",
          alignItems: "center",
          cursor: draggedPanelId === "scenes" ? "grabbing" : "grab",
          userSelect: "none",
        }}
      >
        <Icon name="map" size={14} color={a.main} style={{ marginRight: 8 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>Scene Plan</span>
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: `${pad}px` }}>
        {error && (
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "oklch(94% 0.08 20)", border: "1px solid oklch(80% 0.1 20)", fontSize: 12, color: "oklch(35% 0.14 20)", display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="alertTriangle" size={13} color="oklch(45% 0.16 20)" />
            {error}
          </div>
        )}

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
              {!typeFilter && <InsertDivider index={0} />}
              {filteredScenes.map((scene, i) => (
                <React.Fragment key={scene.id}>
                  <SceneRow scene={scene} />
                  {!typeFilter && <InsertDivider index={i + 1} />}
                </React.Fragment>
              ))}
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
  );

  const renderInfoPanelContent = () => (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: t.bgSurface,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        overflow: "hidden",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        onMouseDown={(e) => startDraggingPanelHeader(e, "info")}
        style={{
          height: 40,
          padding: "0 12px",
          background: t.bgSubtle,
          borderBottom: `1px solid ${t.border}`,
          display: "flex",
          alignItems: "center",
          cursor: draggedPanelId === "info" ? "grabbing" : "grab",
          userSelect: "none",
        }}
      >
        <Icon name="edit" size={14} color={a.main} style={{ marginRight: 8 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>Scene Details</span>
        <button
          onClick={() => setIsInfoOpen(false)}
          title="Close details"
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            borderRadius: 4,
            color: t.textSoft,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = t.bgHover}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          <Icon name="x" size={14} color={t.textSoft} />
        </button>
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <EditorPanel />
      </div>
    </div>
  );

  const renderChatPanelContent = () => (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: t.bgSurface,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        overflow: "hidden",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        onMouseDown={(e) => startDraggingPanelHeader(e, "chat")}
        style={{
          height: 40,
          padding: "0 12px",
          background: t.bgSubtle,
          borderBottom: `1px solid ${t.border}`,
          display: "flex",
          alignItems: "center",
          cursor: draggedPanelId === "chat" ? "grabbing" : "grab",
          userSelect: "none",
        }}
      >
        <Icon name="sparkle" size={14} color={a.main} style={{ marginRight: 8 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>AI Assistant</span>
        <button
          onClick={() => setIsChatOpen(false)}
          title="Close chat"
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            borderRadius: 4,
            color: t.textSoft,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = t.bgHover}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          <Icon name="x" size={14} color={t.textSoft} />
        </button>
      </div>
      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
  );

  const renderColumnContent = (colId) => {
    if (colId === "scenes") {
      if (isInfoOpen && effectiveDockMode === "scenes-top") {
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ height: `${scenesRowRatio}%`, minHeight: 0 }}>
              {renderInfoPanelContent()}
            </div>
            <div
              onMouseDown={(e) => startResizingRow(e, "scenes")}
              style={{
                height: 6,
                margin: "-3px 0",
                cursor: "row-resize",
                zIndex: 100,
                position: "relative",
                flexShrink: 0,
                background: "transparent",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => e.target.style.background = a.main}
              onMouseLeave={(e) => e.target.style.background = "transparent"}
            />
            <div style={{ height: `${100 - scenesRowRatio}%`, minHeight: 0 }}>
              {renderScenesPanelContent()}
            </div>
          </div>
        );
      }
      if (isInfoOpen && effectiveDockMode === "scenes-bottom") {
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ height: `${scenesRowRatio}%`, minHeight: 0 }}>
              {renderScenesPanelContent()}
            </div>
            <div
              onMouseDown={(e) => startResizingRow(e, "scenes")}
              style={{
                height: 6,
                margin: "-3px 0",
                cursor: "row-resize",
                zIndex: 100,
                position: "relative",
                flexShrink: 0,
                background: "transparent",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => e.target.style.background = a.main}
              onMouseLeave={(e) => e.target.style.background = "transparent"}
            />
            <div style={{ height: `${100 - scenesRowRatio}%`, minHeight: 0 }}>
              {renderInfoPanelContent()}
            </div>
          </div>
        );
      }
      return renderScenesPanelContent();
    }

    if (colId === "chat") {
      if (isInfoOpen && effectiveDockMode === "chat-top") {
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ height: `${chatRowRatio}%`, minHeight: 0 }}>
              {renderInfoPanelContent()}
            </div>
            <div
              onMouseDown={(e) => startResizingRow(e, "chat")}
              style={{
                height: 6,
                margin: "-3px 0",
                cursor: "row-resize",
                zIndex: 100,
                position: "relative",
                flexShrink: 0,
                background: "transparent",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => e.target.style.background = a.main}
              onMouseLeave={(e) => e.target.style.background = "transparent"}
            />
            <div style={{ height: `${100 - chatRowRatio}%`, minHeight: 0 }}>
              {renderChatPanelContent()}
            </div>
          </div>
        );
      }
      if (isInfoOpen && effectiveDockMode === "chat-bottom") {
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ height: `${chatRowRatio}%`, minHeight: 0 }}>
              {renderChatPanelContent()}
            </div>
            <div
              onMouseDown={(e) => startResizingRow(e, "chat")}
              style={{
                height: 6,
                margin: "-3px 0",
                cursor: "row-resize",
                zIndex: 100,
                position: "relative",
                flexShrink: 0,
                background: "transparent",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => e.target.style.background = a.main}
              onMouseLeave={(e) => e.target.style.background = "transparent"}
            />
            <div style={{ height: `${100 - chatRowRatio}%`, minHeight: 0 }}>
              {renderInfoPanelContent()}
            </div>
          </div>
        );
      }
      return renderChatPanelContent();
    }

    if (colId === "info") {
      return renderInfoPanelContent();
    }

    return null;
  };

  const handleReprocessScene = async (id, targetType) => {
    setReprocessingId(id);
    setError(null);
    try {
      const res = await fetch("/reprocess-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          scene_id: id,
          target_type: targetType,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Reprocessing failed" }));
        throw new Error(err.detail || "Reprocessing failed");
      }
      const data = await res.json();
      updateScenes(data.scenes, id);
    } catch (e) {
      setError(e.message || "Reprocessing failed");
    } finally {
      setReprocessingId(null);
    }
  };

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
      setIsInfoOpen(false);
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
    setIsInfoOpen(true);
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

  const filteredScenes = typeFilter ? scenes.filter((scene) => scene.type === typeFilter) : scenes;

  const SceneRow = ({ scene, compact }) => {
    const [hovered, setHovered] = React.useState(false);
    const active = isInfoOpen && selectedId === scene.id;
    return (
      <div
        onClick={() => handleSceneClick(scene.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "32px 118px 1fr" : "34px 124px 116px 1fr",
          gap: 10,
          alignItems: compact ? "center" : "start",
          padding: compact ? "10px 12px" : "12px 14px",
          borderBottom: `1px solid ${t.border}`,
          background: active 
            ? (theme === "light" ? a.light : t.bgSubtle) 
            : (hovered ? t.bgHover : t.bgSurface),
          borderLeft: `3px solid ${active ? a.main : (hovered ? (theme === "light" ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)") : "transparent")}`,
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

  const InsertDivider = ({ index }) => {
    const [hovered, setHovered] = React.useState(false);
    if (isApproved || typeFilter !== null) return null;
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          height: hovered ? 24 : 8,
          margin: "-4px 0",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 0.15s ease",
          zIndex: 10,
        }}
        onClick={(e) => {
          e.stopPropagation();
          const draft = emptyScene(scenes.length + 1);
          const next = [...scenes.slice(0, index), draft, ...scenes.slice(index)];
          updateScenes(next, index + 1);
          setIsInfoOpen(true);
        }}
      >
        <div style={{
          position: "absolute",
          left: 0, right: 0,
          height: 2,
          background: hovered ? a.main : "transparent",
          transition: "all 0.15s ease",
        }} />
        <div style={{
          position: "relative",
          width: hovered ? 84 : 16,
          height: 16,
          borderRadius: 8,
          background: hovered ? a.main : "transparent",
          border: hovered ? "none" : `1px solid ${t.border}`,
          color: hovered ? "#fff" : t.textSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 600,
          transition: "all 0.15s ease",
          boxShadow: hovered ? "0 2px 4px rgba(0,0,0,0.15)" : "none",
        }}>
          <Icon name="plus" size={10} color={hovered ? "#fff" : t.textSoft} />
          {hovered && <span style={{ marginLeft: 4 }}>Add Scene</span>}
        </div>
      </div>
    );
  };

  const CardItem = ({ scene }) => {
    const [hovered, setHovered] = React.useState(false);
    const active = isInfoOpen && selectedId === scene.id;
    return (
      <div
        onClick={() => handleSceneClick(scene.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: 8,
          border: `1px solid ${active ? a.main : (hovered ? a.main : t.border)}`,
          background: active 
            ? (theme === "light" ? a.light : t.bgSubtle) 
            : (hovered ? t.bgHover : t.bgSurface),
          overflow: "hidden",
          cursor: "pointer",
          transition: "all 0.15s ease",
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
  };

  const CardView = () => {
    const filteredScenes = typeFilter ? scenes.filter((scene) => scene.type === typeFilter) : scenes;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!typeFilter && <InsertDivider index={0} />}
        {filteredScenes.map((scene, i) => {
          return (
            <React.Fragment key={scene.id}>
              <CardItem scene={scene} />
              {!typeFilter && <InsertDivider index={i + 1} />}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

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
      <div style={{ padding: `${pad}px`, background: t.bgSurface }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Badge type={selectedScene.type} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <Btn small variant="secondary" icon="plus" theme={theme} accent={accent} onClick={(e) => { e.stopPropagation(); addSceneAt("before"); }} disabled={isApproved}>
              Before
            </Btn>
            <Btn small variant="secondary" icon="plus" theme={theme} accent={accent} onClick={(e) => { e.stopPropagation(); addSceneAt("after"); }} disabled={isApproved}>
              After
            </Btn>
            <Btn small variant="danger" icon="trash" theme={theme} accent={accent} onClick={(e) => { e.stopPropagation(); deleteScene(selectedScene.id); }} disabled={isApproved || scenes.length <= 1}>
              Delete
            </Btn>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 10, color: t.textSoft, fontWeight: 700, letterSpacing: "0.04em" }}>
            TYPE
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={selectedScene.type}
                disabled={isApproved || reprocessingId !== null}
                onChange={(e) => patchScene(selectedScene.id, { type: e.target.value })}
                style={{ flex: 1, padding: "8px 9px", borderRadius: 7, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 12, fontFamily: FONTS.mono }}
              >
                {ASSET_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <Btn
                small
                variant="secondary"
                icon={reprocessingId === selectedScene.id ? "refresh" : "sparkle"}
                theme={theme}
                accent={accent}
                disabled={isApproved || reprocessingId !== null}
                onClick={() => handleReprocessScene(selectedScene.id, selectedScene.type)}
              >
                {reprocessingId === selectedScene.id ? "Rewriting..." : "Re-process"}
              </Btn>
            </div>
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
              <option value="9:16">9:16</option>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6, marginRight: 8, borderRight: `1px solid ${t.border}`, paddingRight: 12 }}>
              <button
                onClick={() => setIsInfoOpen(!isInfoOpen)}
                title={isInfoOpen ? "Hide Scene Details" : "Show Scene Details"}
                style={{
                  background: isInfoOpen ? a.light : "transparent",
                  border: `1px solid ${isInfoOpen ? a.main : t.border}`,
                  borderRadius: 8,
                  width: 34,
                  height: 34,
                  cursor: "pointer",
                  color: isInfoOpen ? a.text : t.textMid,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                  padding: 0,
                }}
              >
                <Icon name="edit" size={14} color={isInfoOpen ? a.main : t.textMid} />
              </button>
              <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                title={isChatOpen ? "Hide AI Assistant" : "Show AI Assistant"}
                style={{
                  background: isChatOpen ? a.light : "transparent",
                  border: `1px solid ${isChatOpen ? a.main : t.border}`,
                  borderRadius: 8,
                  width: 34,
                  height: 34,
                  cursor: "pointer",
                  color: isChatOpen ? a.text : t.textMid,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                  padding: 0,
                }}
              >
                <Icon name="sparkle" size={14} color={isChatOpen ? a.main : t.textMid} />
              </button>
            </div>
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

      <div style={{ display: "flex", gap: 8, padding: `8px ${pad}px`, background: t.bgSurface, borderBottom: `1px solid ${t.border}`, alignItems: "center" }}>
        {ASSET_TYPES.map((type) => {
          const isActive = typeFilter === type;
          return (
            <div
              key={type}
              onClick={() => setTypeFilter(isActive ? null : type)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: 20,
                background: isActive ? a.light : "transparent",
                border: `1px solid ${isActive ? a.main : "transparent"}`,
                transition: "all 0.2s ease",
                userSelect: "none",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = t.bgSubtle; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <Badge type={type} />
              <span style={{ fontSize: 11, color: isActive ? a.text : t.textSoft, fontFamily: FONTS.mono, fontWeight: isActive ? 600 : 500 }}>
                {typeCount[type] || 0}
              </span>
            </div>
          );
        })}
        {typeFilter && (
          <button
            onClick={() => setTypeFilter(null)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 10,
              color: a.main,
              fontWeight: 600,
              marginLeft: 4,
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            Clear Filter
            <Icon name="x" size={10} color={a.main} />
          </button>
        )}
        {isApproved && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: "oklch(35% 0.12 140)", background: "oklch(93% 0.07 140)", padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
            <Icon name="lock" size={11} color="oklch(35% 0.12 140)" />
            Locked
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        id="mapping-panels-container"
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          position: "relative",
          gap: 8,
          padding: 8,
          background: t.bg,
        }}
      >
        {activeColumns.map((colId, index) => {
          const width = activeColumns.length === 3
            ? colWidths3[index]
            : (activeColumns.length === 2 ? colWidths2[index] : 100);
          return (
            <React.Fragment key={colId}>
              <div
                id={`column-${colId}`}
                style={{
                  width: `${width}%`,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  height: "100%",
                }}
              >
                {renderColumnContent(colId)}
              </div>

              {index < activeColumns.length - 1 && (
                <div
                  onMouseDown={(e) => startResizingColumns(e, index)}
                  style={{
                    width: 6,
                    margin: "0 -3px",
                    cursor: "col-resize",
                    zIndex: 100,
                    position: "relative",
                    flexShrink: 0,
                    background: "transparent",
                    transition: "background 0.2s ease",
                  }}
                  onMouseEnter={(e) => e.target.style.background = a.main}
                  onMouseLeave={(e) => e.target.style.background = "transparent"}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* DRAG AND DROP DOCK PREVIEW OVERLAY */}
        {draggedPanelId !== null && dragOverlayStyle && (
          <div style={{
            position: "absolute",
            background: `oklch(from ${a.main} l c h / 0.08)`,
            border: `2px dashed ${a.main}`,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            pointerEvents: "none",
            transition: "all 0.15s ease",
            ...dragOverlayStyle
          }}>
            <div style={{
              background: t.bgSurface,
              border: `1px solid ${t.border}`,
              padding: "12px 20px",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              color: a.main,
              fontSize: 12,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <Icon name="sparkle" size={14} color={a.main} />
              Drop Panel Here
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { MappingScreen });
