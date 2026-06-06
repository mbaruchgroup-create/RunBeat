// runbeat-ui.jsx — shared visual atoms + icon set
// Exports (to window): Icon, Cover, TabBar, Seg

(function () {
  // ── Icon set — simple stroke icons ─────────────────────────────────────
  function Icon({ name, size = 24, stroke = 'currentColor', fill = 'none', sw = 2, style }) {
    const p = { fill, stroke, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
    const paths = {
      gauge: <g {...p}><path d="M4 19a8 8 0 1 1 16 0" /><path d="M12 19l4.2-5" /><circle cx="12" cy="19" r="1.1" fill={stroke} stroke="none" /></g>,
      pulse: <polyline {...p} points="2,12 7,12 10,5 14,19 17,12 22,12" />,
      note:  <g {...p}><path d="M9 18V5l11-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="15" r="3" /></g>,
      mixer: <g {...p}><line x1="6" y1="4" x2="6" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /><line x1="18" y1="4" x2="18" y2="20" /><circle cx="6" cy="9" r="2.2" fill="var(--bg)" /><circle cx="12" cy="15" r="2.2" fill="var(--bg)" /><circle cx="18" cy="8" r="2.2" fill="var(--bg)" /></g>,
      play:  <path d="M7 4.5v15l13-7.5z" fill={stroke} stroke="none" />,
      pause: <g fill={stroke} stroke="none"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></g>,
      next:  <g><path d="M5 5l11 7-11 7z" fill={stroke} stroke="none" /><rect x="17.5" y="5" width="2.6" height="14" rx="1.2" fill={stroke} stroke="none" /></g>,
      prev:  <g><path d="M19 5L8 12l11 7z" fill={stroke} stroke="none" /><rect x="3.9" y="5" width="2.6" height="14" rx="1.2" fill={stroke} stroke="none" /></g>,
      check: <polyline {...p} points="4,12 10,18 20,5" />,
      chevron: <polyline {...p} points="9,5 16,12 9,19" />,
      x:     <g {...p}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></g>,
      search:<g {...p}><circle cx="11" cy="11" r="7" /><line x1="16" y1="16" x2="21" y2="21" /></g>,
      foot:  <g {...p}><path d="M9 3c2 0 3 2.5 3 6s-1 6-3 6-3-2-3-5 1-7 3-7z" /><circle cx="14.5" cy="16.5" r="1.4" fill={stroke} stroke="none" stroke-width="0"/><circle cx="16.5" cy="13.5" r="1.1" fill={stroke} stroke="none"/></g>,
      bolt:  <path d="M13 2L4 14h6l-1 8 9-12h-6z" {...p} />,
      sliderH: <g {...p}><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/><circle cx="9" cy="8" r="2.4" fill="var(--bg)"/><circle cx="15" cy="16" r="2.4" fill="var(--bg)"/></g>,
      target: <g {...p}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/></g>,
      speed:  <g {...p}><path d="M12 4a8 8 0 1 0 8 8"/><path d="M12 12l6-4"/></g>,
      sound:  <g {...p}><path d="M4 9v6h4l5 4V5L8 9z" fill={stroke} stroke="none"/><path d="M16 9c1.2 1 1.2 5 0 6" stroke={stroke} fill="none"/></g>,
    };
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={style}>{paths[name]}</svg>
    );
  }

  // ── Cover art placeholder (gradient tile) ──────────────────────────────
  function Cover({ track, size = 52, radius = 12, playing = false }) {
    return (
      <div style={{
        width: size, height: size, borderRadius: radius, flexShrink: 0,
        background: `linear-gradient(135deg, ${track.c1}, ${track.c2})`,
        position: 'relative', overflow: 'hidden',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(115deg, rgba(255,255,255,0.10) 0 2px, transparent 2px 9px)',
        }} />
        {playing && (
          <div style={{ display: 'flex', gap: 2.5, alignItems: 'flex-end', height: size * 0.34, position: 'relative' }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="eqbar" style={{
                width: Math.max(2, size * 0.05), background: 'rgba(255,255,255,0.95)', borderRadius: 2,
                animationDelay: `${i * 0.13}s`,
              }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Segmented control ──────────────────────────────────────────────────
  function Seg({ options, value, onChange }) {
    return (
      <div style={{
        display: 'flex', gap: 4, padding: 4, borderRadius: 14,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
      }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button key={o.value} onClick={() => onChange(o.value)} style={{
              flex: 1, border: 'none', cursor: 'pointer', borderRadius: 10,
              padding: '9px 6px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              letterSpacing: 0.2, transition: 'all .18s',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--text-dim)',
            }}>{o.label}</button>
          );
        })}
      </div>
    );
  }

  // ── Bottom tab bar ─────────────────────────────────────────────────────
  function TabBar({ tab, setTab }) {
    const tabs = [
      { id: 'ritmo',   label: 'Ritmo',   icon: 'gauge' },
      { id: 'correr',  label: 'Correr',  icon: 'pulse' },
      { id: 'musicas', label: 'Músicas', icon: 'note' },
      { id: 'mixer',   label: 'Mixer',   icon: 'mixer' },
    ];
    return (
      <nav style={{
        display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
        paddingBottom: 30, paddingTop: 10, gap: 2,
        background: 'var(--bar)', borderTop: '1px solid var(--border)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              color: active ? 'var(--accent-text)' : 'var(--text-faint)',
              fontFamily: 'inherit', transition: 'color .18s', padding: 0,
            }}>
              <Icon name={t.icon} size={24} sw={active ? 2.4 : 2} />
              <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 600, letterSpacing: 0.2 }}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  Object.assign(window, { Icon, Cover, TabBar, Seg });
})();
