
// StyleScreen.jsx — Phase 4: Style configuration

const DEFAULT_PRESETS = [
  {
    id: "editorial-dark",
    name: "Editorial Dark",
    desc: "Deep navy backgrounds, clean white type, data-forward",
    bg: "#0d1b2a",
    accent: "#4fa3d4",
    preview: ["#0d1b2a","#4fa3d4","#e8f4fd"],
    prompt: "flat vector style, deep navy blue background (#0d1b2a), clean white typography, teal accent color (#4fa3d4), data-forward infographic composition, no gradients, no 3D, no photography",
  },
  {
    id: "minimal-light",
    name: "Minimal Light",
    desc: "Off-white ground, charcoal type, restrained palette",
    bg: "#f5f2ee",
    accent: "#2d4a3e",
    preview: ["#f5f2ee","#2d4a3e","#b8c8c1"],
    prompt: "minimal flat design, off-white background (#f5f2ee), charcoal typography (#2d4a3e), restrained muted color palette, clean geometric shapes, no gradients, no drop shadows",
  },
  {
    id: "bold-data",
    name: "Bold Data",
    desc: "Vivid accent colors on white, high contrast, infographic-native",
    bg: "#ffffff",
    accent: "#e63946",
    preview: ["#ffffff","#e63946","#457b9d"],
    prompt: "bold high-contrast infographic style, pure white background (#ffffff), vivid red accent (#e63946), strong typography, data visualization focused, flat design, no gradients",
  },
  {
    id: "warm-studio",
    name: "Warm Studio",
    desc: "Warm cream, dusty rose, editorial magazine feel",
    bg: "#faf3e8",
    accent: "#c97b4b",
    preview: ["#faf3e8","#c97b4b","#8b5e3c"],
    prompt: "warm editorial style, cream background (#faf3e8), terracotta and dusty rose accents (#c97b4b), magazine layout aesthetic, serif-friendly composition, flat design, no photography",
  },
];

const PRESET_CARD_W = 160;

const StyleScreen = ({ theme, accent, density, sessionId, onNext }) => {
  const t = THEMES[theme];
  const a = ACCENTS[accent];
  const [presets, setPresets] = React.useState(DEFAULT_PRESETS);
  const [selectedPreset, setSelectedPreset] = React.useState("editorial-dark");
  const [customMode, setCustomMode] = React.useState(false);
  const [customText, setCustomText] = React.useState("");
  const [negativeText, setNegativeText] = React.useState("no 3D elements, no gradients, no drop shadows");
  const [bgColor, setBgColor] = React.useState("#0d1b2a");
  const [saveLabel, setSaveLabel] = React.useState("");
  const [scrollX, setScrollX] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const scrollRef = React.useRef(null);
  const colorInputRef = React.useRef(null);
  const pad = density === "compact" ? 16 : 24;

  const SCROLL_STEP = PRESET_CARD_W * 2 + 12;

  const scrollLeft  = () => { if (scrollRef.current) scrollRef.current.scrollBy({ left: -SCROLL_STEP, behavior: "smooth" }); };
  const scrollRight = () => { if (scrollRef.current) scrollRef.current.scrollBy({ left: SCROLL_STEP, behavior: "smooth" }); };

  const handleScroll = () => { if (scrollRef.current) setScrollX(scrollRef.current.scrollLeft); };

  const canScrollLeft  = scrollX > 4;
  const canScrollRight = scrollRef.current
    ? scrollX < scrollRef.current.scrollWidth - scrollRef.current.clientWidth - 4
    : presets.length > 3;

  const saveToLibrary = () => {
    if (!saveLabel.trim()) return;
    const newPreset = {
      id: `custom-${Date.now()}`,
      name: saveLabel.trim(),
      desc: customText.trim() || "Custom style",
      bg: bgColor,
      accent: a.main,
      preview: [bgColor, a.main, "#ffffff"],
      prompt: customText.trim(),
      custom: true,
    };
    setPresets(prev => [...prev, newPreset]);
    setSelectedPreset(newPreset.id);
    setSaveLabel("");
  };

  const handleStartGeneration = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      // Build style config from selection
      let stylePrompt, styleName, styleBg;
      if (customMode && customText.trim()) {
        styleName = saveLabel.trim() || "Custom Style";
        styleBg = bgColor;
        const neg = negativeText.trim() ? ` Negative: ${negativeText.trim()}` : "";
        stylePrompt = customText.trim() + neg;
      } else {
        const preset = presets.find(p => p.id === selectedPreset);
        styleName = preset ? preset.name : "Editorial Dark";
        styleBg = preset ? preset.bg : "#0d1b2a";
        const neg = negativeText.trim() ? ` Negative: ${negativeText.trim()}` : "";
        stylePrompt = (preset ? preset.prompt : DEFAULT_PRESETS[0].prompt) + neg;
      }

      const res = await fetch("/set-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          name: styleName,
          prompt: stylePrompt,
          background_color: styleBg,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to set style");
      }
      onNext && onNext(styleName);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: t.bg, overflow: "auto" }}>
      <TopBar
        title="Visual Style Configuration"
        subtitle="Select a preset or define a custom style — applied to every generated image"
        theme={theme} accent={accent}
        actions={
          <Btn variant="primary" icon="chevronRight" theme={theme} accent={accent} onClick={handleStartGeneration} disabled={loading}>
            {loading ? "Saving…" : "Start Generation"}
          </Btn>
        }
      />

      <div style={{ padding: `${pad}px`, maxWidth: 820, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "oklch(94% 0.08 20)", border: "1px solid oklch(80% 0.1 20)", fontSize: 12, color: "oklch(35% 0.14 20)", display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="alertTriangle" size={13} color="oklch(45% 0.16 20)" />
            {error}
          </div>
        )}

        {/* Presets — horizontally scrollable */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.textMid, marginBottom: 10, letterSpacing: "0.04em" }}>
            STYLE PRESETS
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: t.textSoft }}>
              {presets.length} styles
            </span>
          </label>

          <div style={{ position: "relative" }}>
            {canScrollLeft && (
              <button
                onClick={scrollLeft}
                style={{
                  position: "absolute", left: -14, top: "50%", transform: "translateY(-50%)",
                  zIndex: 2, width: 28, height: 28, borderRadius: "50%",
                  background: t.bgSurface, border: `1px solid ${t.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.textMid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              style={{
                display: "flex", gap: 10, overflowX: "auto", overflowY: "hidden",
                scrollbarWidth: "none", msOverflowStyle: "none",
                paddingBottom: 4,
              }}
            >
              {presets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => { setSelectedPreset(preset.id); setCustomMode(false); setBgColor(preset.bg); }}
                  style={{
                    width: PRESET_CARD_W, flexShrink: 0,
                    border: `2px solid ${selectedPreset === preset.id && !customMode ? a.main : t.border}`,
                    borderRadius: 12, overflow: "hidden", cursor: "pointer",
                    background: t.bgSurface, textAlign: "left",
                    transition: "border-color 0.15s ease",
                    outline: "none",
                  }}
                >
                  <div style={{ height: 48, background: preset.bg, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "0 10px" }}>
                    {preset.preview.slice(1).map((c, i) => (
                      <div key={i} style={{ width: 14, height: 14, borderRadius: 4, background: c, flexShrink: 0 }} />
                    ))}
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: preset.accent, marginLeft: 4 }} />
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: t.text, marginBottom: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{preset.name}</div>
                    <div style={{
                      fontSize: 10, color: t.textSoft, lineHeight: 1.4,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>{preset.desc}</div>
                  </div>
                  {selectedPreset === preset.id && !customMode && (
                    <div style={{ padding: "0 10px 8px", display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 14, height: 14, borderRadius: "50%", background: a.main, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="check" size={8} color="#fff" />
                      </div>
                      <span style={{ fontSize: 10, color: a.text, fontWeight: 600 }}>Selected</span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {canScrollRight && (
              <button
                onClick={scrollRight}
                style={{
                  position: "absolute", right: -14, top: "50%", transform: "translateY(-50%)",
                  zIndex: 2, width: 28, height: 28, borderRadius: "50%",
                  background: t.bgSurface, border: `1px solid ${t.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.textMid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: t.border }} />
          <span style={{ fontSize: 11, color: t.textSoft, letterSpacing: "0.06em" }}>OR DEFINE CUSTOM</span>
          <div style={{ flex: 1, height: 1, background: t.border }} />
        </div>

        {/* Custom style */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: t.textMid, letterSpacing: "0.04em" }}>CUSTOM STYLE</label>
            <button
              onClick={() => setCustomMode(!customMode)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 6, border: `1px solid ${customMode ? a.main : t.border}`,
                background: customMode ? a.light : "transparent",
                color: customMode ? a.text : t.textMid,
                fontSize: 11, fontWeight: 500, cursor: "pointer",
              }}
            >
              <Icon name={customMode ? "check" : "edit"} size={11} color={customMode ? a.text : t.textMid} />
              {customMode ? "Custom active" : "Use custom style"}
            </button>
          </div>

          <div style={{
            borderRadius: 10, border: `1px solid ${customMode ? a.main : t.border}`,
            background: t.bgSurface, overflow: "hidden",
            opacity: customMode ? 1 : 0.55, transition: "opacity 0.15s ease",
          }}>
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Style description */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textMid, marginBottom: 5, letterSpacing: "0.04em" }}>STYLE DESCRIPTION</label>
                <textarea
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  disabled={!customMode}
                  placeholder="Describe the visual style in detail — e.g. flat vector illustration, deep cobalt blue background (#0a1628), white and gold typography, minimal geometric shapes, no photography, clean data-forward compositions"
                  rows={3}
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 8, resize: "vertical",
                    border: `1px solid ${t.border}`, background: t.bg,
                    color: t.text, fontSize: 12, fontFamily: FONTS.mono,
                    outline: "none", lineHeight: 1.6, boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 14 }}>
                {/* Background color */}
                <div style={{ width: 200, flexShrink: 0 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textMid, marginBottom: 5, letterSpacing: "0.04em" }}>BACKGROUND COLOR</label>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {/* Color swatch — clicking opens the native OS color picker */}
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <button
                        type="button"
                        disabled={!customMode}
                        onClick={() => customMode && colorInputRef.current && colorInputRef.current.click()}
                        title="Pick a color"
                        style={{
                          width: 36, height: 36, borderRadius: 6,
                          background: bgColor,
                          border: `2px solid ${t.border}`,
                          cursor: customMode ? "pointer" : "default",
                          padding: 0, outline: "none",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "border-color 0.15s",
                        }}
                        onMouseEnter={e => { if (customMode) e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; }}
                      >
                        {/* Eyedropper icon hint */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke={bgColor === "#ffffff" || bgColor === "#fff" || bgColor?.toLowerCase() === "#faf3e8" || bgColor?.toLowerCase() === "#f5f2ee" ? "#555" : "rgba(255,255,255,0.6)"}
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          style={{ opacity: customMode ? 1 : 0 }}
                        >
                          <path d="M12 2l-1.5 1.5 8 8L20 10z"/>
                          <path d="M10.5 3.5L3 11l-.5 4.5L7 15l7.5-7.5z"/>
                          <line x1="2" y1="22" x2="6" y2="18"/>
                        </svg>
                      </button>
                      {/* Hidden native color picker */}
                      <input
                        ref={colorInputRef}
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : "#0d1b2a"}
                        onChange={e => setBgColor(e.target.value)}
                        disabled={!customMode}
                        tabIndex={-1}
                        style={{
                          position: "absolute", top: 0, left: 0,
                          width: "100%", height: "100%",
                          opacity: 0, pointerEvents: "none",
                          border: "none", padding: 0,
                        }}
                      />
                    </div>
                    <input
                      value={bgColor}
                      onChange={e => {
                        setBgColor(e.target.value);
                        // sync native picker if the typed value is a valid 6-digit hex
                        if (/^#[0-9a-fA-F]{6}$/.test(e.target.value) && colorInputRef.current) {
                          colorInputRef.current.value = e.target.value;
                        }
                      }}
                      disabled={!customMode}
                      placeholder="#0d1b2a"
                      style={{
                        flex: 1, padding: "6px 8px", borderRadius: 6,
                        border: `1px solid ${t.border}`, background: t.bg,
                        color: t.text, fontSize: 11, fontFamily: FONTS.mono, outline: "none",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: t.textSoft, marginTop: 4 }}>Solid only. No gradients.</div>
                </div>
              </div>

              {/* Negative instructions */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textMid, marginBottom: 5, letterSpacing: "0.04em" }}>NEGATIVE INSTRUCTIONS</label>
                <input
                  value={negativeText}
                  onChange={e => setNegativeText(e.target.value)}
                  disabled={!customMode}
                  placeholder="no 3D elements, no gradients, vector only"
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 8,
                    border: `1px solid ${t.border}`, background: t.bg,
                    color: t.text, fontSize: 12, fontFamily: FONTS.mono,
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Save row */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textMid, marginBottom: 5, letterSpacing: "0.04em" }}>SAVE AS</label>
                  <input
                    value={saveLabel}
                    onChange={e => setSaveLabel(e.target.value)}
                    disabled={!customMode}
                    placeholder="Name this style for library…"
                    style={{
                      width: "100%", padding: "7px 10px", borderRadius: 8,
                      border: `1px solid ${t.border}`, background: t.bg,
                      color: t.text, fontSize: 12, fontFamily: FONTS.mono,
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                <Btn
                  variant={saveLabel.trim() && customMode ? "primary" : "secondary"}
                  theme={theme} accent={accent} icon="star"
                  disabled={!customMode || !saveLabel.trim()}
                  onClick={saveToLibrary}
                >
                  Save to Library
                </Btn>
              </div>
            </div>
          </div>
        </div>

        {/* Session summary */}
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: t.bgSubtle, border: `1px solid ${t.border}`,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <Icon name="info" size={13} color={t.textSoft} />
          <span style={{ fontSize: 11, color: t.textSoft, lineHeight: 1.5 }}>
            Selected style applied to all images. Background enforced at prompt level and validated post-generation.
          </span>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { StyleScreen, DEFAULT_PRESETS });
