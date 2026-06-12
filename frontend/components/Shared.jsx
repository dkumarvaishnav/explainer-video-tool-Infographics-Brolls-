
// Shared.jsx — shared tokens, icons, layout chrome

// ── Tokens ──────────────────────────────────────────────────────────────────
const FONTS = {
  sansSerif: "'DM Sans', sans-serif",
  mono: "'DM Mono', monospace",
};

const THEMES = {
  light: {
    bg: "oklch(98% 0.005 250)",
    bgSurface: "oklch(100% 0 0)",
    bgSubtle: "oklch(95% 0.007 250)",
    bgHover: "oklch(93% 0.009 250)",
    border: "oklch(88% 0.008 250)",
    borderStrong: "oklch(78% 0.01 250)",
    text: "oklch(13% 0.01 250)",
    textMid: "oklch(42% 0.01 250)",
    textSoft: "oklch(62% 0.009 250)",
    sidebar: "oklch(16% 0.012 250)",
    sidebarText: "oklch(72% 0.008 250)",
    sidebarActive: "oklch(100% 0 0)",
  },
  dark: {
    bg: "oklch(11% 0.01 265)",
    bgSurface: "oklch(15% 0.012 265)",
    bgSubtle: "oklch(19% 0.014 265)",
    bgHover: "oklch(22% 0.016 265)",
    border: "oklch(26% 0.014 265)",
    borderStrong: "oklch(34% 0.016 265)",
    text: "oklch(94% 0.006 265)",
    textMid: "oklch(68% 0.008 265)",
    textSoft: "oklch(50% 0.008 265)",
    sidebar: "oklch(9% 0.01 265)",
    sidebarText: "oklch(60% 0.008 265)",
    sidebarActive: "oklch(94% 0.006 265)",
  },
};

const ACCENTS = {
  teal:   { main: "oklch(58% 0.14 195)", light: "oklch(94% 0.05 195)", text: "oklch(35% 0.1 195)" },
  violet: { main: "oklch(58% 0.18 280)", light: "oklch(93% 0.06 280)", text: "oklch(35% 0.12 280)" },
  amber:  { main: "oklch(68% 0.14 72)",  light: "oklch(95% 0.05 72)",  text: "oklch(40% 0.12 72)"  },
};

const SCENE_TYPE_COLORS = {
  INFOGRAPHIC: { bg: "oklch(93% 0.07 195)", text: "oklch(35% 0.12 195)", dot: "oklch(55% 0.15 195)" },
  BROLL:       { bg: "oklch(94% 0.06 140)", text: "oklch(35% 0.12 140)", dot: "oklch(52% 0.14 140)" },
};

const STATUS_COLORS = {
  pending:      { bg: "oklch(93% 0.006 250)", text: "oklch(50% 0.01 250)" },
  generating:   { bg: "oklch(95% 0.07 72)",  text: "oklch(45% 0.12 72)"  },
  completed:    { bg: "oklch(93% 0.07 140)", text: "oklch(38% 0.12 140)" },
  failed:       { bg: "oklch(94% 0.08 20)",  text: "oklch(40% 0.14 20)"  },
  needs_review: { bg: "oklch(95% 0.06 60)",  text: "oklch(42% 0.12 60)"  },
};

// ── Icons (inline SVG components) ───────────────────────────────────────────
const Icon = ({ name, size = 16, color = "currentColor", style: extraStyle }) => {
  const paths = {
    upload:     <><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></>,
    file:       <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    map:        <><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></>,
    palette:    <><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></>,
    zap:        <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    download:   <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    check:      <><polyline points="20 6 9 17 4 12"/></>,
    checkCircle:<><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    x:          <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    send:       <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    refresh:    <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></>,
    lock:       <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>,
    edit:       <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    clock:      <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    image:      <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    layers:     <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    chevronRight: <><polyline points="9 18 15 12 9 6"/></>,
    chevronDown:  <><polyline points="6 9 12 15 18 9"/></>,
    star:       <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    info:       <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
    settings:   <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></>,
    sparkle:    <><path d="M9.937 15.5A2 2 0 008 17.5a2 2 0 01-2-2 2 2 0 00-2-2 2 2 0 012-2 2 2 0 002-2 2 2 0 002 2 2 2 0 012 2 2 2 0 01-2 2z"/><path d="M20 3a2 2 0 01-2 2 2 2 0 012 2 2 2 0 012-2 2 2 0 01-2-2zM17 8a2 2 0 01-2 2 2 2 0 012 2 2 2 0 012-2 2 2 0 01-2-2z"/></>,
    folder:     <><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></>,
    alertTriangle: <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    plus:       <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    trash:      <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></>,
    copy:       <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>,
    columns:    <><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/></>,
    list:       <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
  };
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle", ...extraStyle }}
    >
      {paths[name] || null}
    </svg>
  );
};

// ── Badge ────────────────────────────────────────────────────────────────────
const Badge = ({ type, size = "sm" }) => {
  const c = SCENE_TYPE_COLORS[type] || { bg: "#eee", text: "#333", dot: "#888" };
  const pad = size === "sm" ? "3px 8px" : "4px 10px";
  const fs = size === "sm" ? 10 : 11;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: c.bg, color: c.text,
      borderRadius: 20, padding: pad, fontSize: fs, fontWeight: 600,
      letterSpacing: "0.03em", whiteSpace: "nowrap",
      fontFamily: FONTS.mono,
      lineHeight: 1.4,
      flexShrink: 0,
      maxWidth: "100%",
      overflow: "hidden",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot, flexShrink: 0 }}></span>
      {type}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS.pending;
  const labels = { pending: "Pending", generating: "Generating…", completed: "Done", failed: "Failed", needs_review: "Review" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: c.bg, color: c.text,
      borderRadius: 20, padding: "3px 9px", fontSize: 10, fontWeight: 600,
      letterSpacing: "0.04em", fontFamily: FONTS.mono,
      whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.4,
    }}>
      {labels[status] || status}
    </span>
  );
};

// ── Phase Sidebar ─────────────────────────────────────────────────────────────
const PHASES = [
  { id: "upload",   label: "Upload",   icon: "upload",   sub: "Input mode" },
  { id: "mapping",  label: "Mapping",  icon: "map",      sub: "Scene plan" },
  { id: "prompts",  label: "Prompts",  icon: "copy",     sub: "Copy-ready" },
];

const PhaseSidebar = ({ activePhase, theme, accent, onPhaseClick, compact }) => {
  const t = THEMES[theme];
  const a = ACCENTS[accent];
  const phaseIndex = PHASES.findIndex(p => p.id === activePhase);
  return (
    <div style={{
      width: compact ? 56 : 200, background: t.sidebar, flexShrink: 0,
      display: "flex", flexDirection: "column",
      borderRight: `1px solid ${theme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.05)"}`,
      transition: "width 0.2s ease",
    }}>
      {/* Logo */}
      <div style={{
        padding: compact ? "20px 0" : "20px 18px",
        display: "flex", alignItems: "center", gap: 10,
        borderBottom: `1px solid ${theme === "light" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)"}`,
        justifyContent: compact ? "center" : "flex-start",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: a.main, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Icon name="layers" size={14} color="#fff" />
        </div>
        {!compact && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: "0.04em", lineHeight: 1.2 }}>OBVIOUS</div>
            <div style={{ fontSize: 9, color: t.sidebarText, letterSpacing: "0.06em", lineHeight: 1.2 }}>INFOGRAPHICS</div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: compact ? "12px 0" : "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {PHASES.map((phase, i) => {
          const isActive = phase.id === activePhase;
          const isDone = i < phaseIndex;
          return (
            <button
              key={phase.id}
              onClick={() => onPhaseClick && onPhaseClick(phase.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: compact ? "10px 0" : "9px 10px",
                borderRadius: 8, border: "none", cursor: "pointer",
                background: isActive ? (theme === "light" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)") : "transparent",
                color: isActive ? t.sidebarActive : isDone ? a.main : t.sidebarText,
                justifyContent: compact ? "center" : "flex-start",
                transition: "all 0.15s ease",
                position: "relative",
              }}
            >
              {isActive && (
                <div style={{
                  position: "absolute", left: compact ? 0 : -10, top: "50%", transform: "translateY(-50%)",
                  width: 3, height: 18, borderRadius: 2, background: a.main,
                }} />
              )}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <Icon name={phase.icon} size={16} color={isActive ? t.sidebarActive : isDone ? a.main : t.sidebarText} />
                {isDone && (
                  <div style={{
                    position: "absolute", top: -4, right: -4, width: 10, height: 10,
                    borderRadius: "50%", background: a.main, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon name="check" size={6} color="#fff" />
                  </div>
                )}
              </div>
              {!compact && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 500, lineHeight: 1.3, color: isActive ? t.sidebarActive : isDone ? a.main : t.sidebarText }}>{phase.label}</div>
                  <div style={{ fontSize: 10, color: t.sidebarText, lineHeight: 1.2 }}>{phase.sub}</div>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      {!compact && (
        <div style={{ padding: "12px 10px", borderTop: `1px solid rgba(255,255,255,0.04)` }}>
          <div style={{ fontSize: 10, color: t.sidebarText, letterSpacing: "0.03em" }}>v0.1.0 — localhost</div>
        </div>
      )}
    </div>
  );
};

// ── Top bar ──────────────────────────────────────────────────────────────────
const TopBar = ({ title, subtitle, theme, accent, actions }) => {
  const t = THEMES[theme];
  return (
    <div style={{
      height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 28px",
      background: t.bgSurface,
      borderBottom: `1px solid ${t.border}`,
      flexShrink: 0,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: t.textSoft, marginTop: 1 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
    </div>
  );
};

// ── Button ───────────────────────────────────────────────────────────────────
const Btn = ({ children, variant = "primary", icon, theme, accent, onClick, disabled, small }) => {
  const t = THEMES[theme];
  const a = ACCENTS[accent];
  const [hov, setHov] = React.useState(false);
  const styles = {
    primary: {
      bg: hov ? `oklch(from ${a.main} calc(l - 0.04) c h)` : a.main,
      color: "#fff", border: "none",
    },
    secondary: {
      bg: hov ? t.bgHover : t.bgSubtle,
      color: t.text, border: `1px solid ${t.border}`,
    },
    ghost: {
      bg: hov ? t.bgHover : "transparent",
      color: t.textMid, border: "none",
    },
    danger: {
      bg: hov ? "oklch(52% 0.18 20)" : "oklch(58% 0.18 20)",
      color: "#fff", border: "none",
    },
  };
  const s = styles[variant];
  return (
    <button
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: small ? "5px 12px" : "8px 16px",
        borderRadius: 8, fontSize: small ? 11 : 13, fontWeight: 500,
        fontFamily: FONTS.sansSerif, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s ease",
        background: s.bg, color: s.color, border: s.border || "none",
      }}
    >
      {icon && <Icon name={icon} size={small ? 12 : 14} color={s.color} />}
      {children}
    </button>
  );
};

Object.assign(window, {
  THEMES, ACCENTS, FONTS, SCENE_TYPE_COLORS, STATUS_COLORS,
  Icon, Badge, StatusBadge, PhaseSidebar, TopBar, Btn,
  PHASES,
});
