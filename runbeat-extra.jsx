// runbeat-extra.jsx — Músicas (BPM discovery) + Mixer
// Exports (to window): MusicasScreen, MixerScreen

(function () {
  const { Icon, Cover } = window;

  // ════════════════════════════════════════════════════════════════════════
  // MÚSICAS — discovery by BPM
  // ════════════════════════════════════════════════════════════════════════
  function MusicasScreen({ app }) {
    const { cadence, tol, setTol, track, selectTrack } = app;
    const [showAll, setShowAll] = React.useState(false);

    const scored = window.TRACKS
      .map((t) => ({ t, d: Math.abs(t.bpm - cadence) }))
      .sort((a, b) => a.d - b.d);
    const matches = scored.filter((s) => s.d <= tol);
    const others = scored.filter((s) => s.d > tol);
    const list = showAll ? scored : matches;

    const row = (t, d) => {
      const active = track && track.id === t.id;
      return (
        <button key={t.id} onClick={() => selectTrack(t.id)} style={{
          display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
          padding: 10, borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
          border: '1px solid', transition: 'background .15s',
          background: active ? 'color-mix(in oklch, var(--music) 12%, var(--surface))' : 'var(--surface)',
          borderColor: active ? 'color-mix(in oklch, var(--music) 50%, transparent)' : 'var(--border)',
        }}>
          <Cover track={t} size={50} playing={active && app.musicPlaying && (app.running || app.mixPreview)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artist}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600, color: active ? 'var(--music)' : 'var(--text)' }}>{t.bpm}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.3, padding: '2px 7px', borderRadius: 999,
              background: d === 0 ? 'color-mix(in oklch, var(--accent) 20%, transparent)' : 'var(--surface-2)',
              color: d === 0 ? 'var(--accent-text)' : 'var(--text-faint)',
            }}>{d === 0 ? 'exato' : `±${d}`}</span>
          </div>
        </button>
      );
    };

    return (
      <div style={{ padding: '8px 18px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ paddingTop: 4 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: -0.8, color: 'var(--text)' }}>Músicas</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: 'var(--music)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="note" size={9} stroke="#001014" />
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>via <b style={{ color: 'var(--text)' }}>YouTube Music</b></span>
          </div>
        </header>

        {/* target BPM + tolerance */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600 }}>BPM alvo = sua cadência</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 34, fontWeight: 700, color: 'var(--accent-text)', letterSpacing: -1, lineHeight: 1 }}>{cadence}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[2, 4, 6].map((v) => {
              const active = tol === v;
              return (
                <button key={v} onClick={() => setTol(v)} style={{
                  flex: 1, padding: '10px 4px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 14, fontWeight: 700, border: '1px solid', transition: 'all .15s',
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--text-dim)',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                }}>±{v} BPM</button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 0.3 }}>
            {showAll ? 'TODAS AS FAIXAS' : `NO SEU RITMO · ${matches.length}`}
          </div>
          <button onClick={() => setShowAll(!showAll)} style={{
            border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700, color: 'var(--accent-text)',
          }}>{showAll ? 'Só no ritmo' : 'Ver todas'}</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
              Nenhuma faixa em ±{tol} BPM. Aumente a tolerância ou veja todas.
            </div>
          )}
          {list.map((s) => row(s.t, s.d))}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // MIXER — music vs metronome balance
  // ════════════════════════════════════════════════════════════════════════
  function VFader({ value, onChange, color, label, sub, icon, locked }) {
    const ref = React.useRef(null);
    const setFromY = (clientY) => {
      const r = ref.current.getBoundingClientRect();
      const p = 1 - Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      onChange(+p.toFixed(2));
    };
    const onDown = (e) => {
      e.preventDefault();
      const move = (ev) => setFromY((ev.touches ? ev.touches[0] : ev).clientY);
      move(e.nativeEvent);
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: `color-mix(in oklch, ${color} 18%, var(--surface-2))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          <Icon name={icon} size={20} stroke={color} />
        </div>
        <div ref={ref} onPointerDown={onDown} style={{
          position: 'relative', width: 64, flex: 1, minHeight: 180, borderRadius: 22, cursor: 'pointer',
          background: 'var(--surface-2)', border: '1px solid var(--border)', overflow: 'hidden', touchAction: 'none',
        }}>
          {/* ticks */}
          {[0.25, 0.5, 0.75].map((p) => (
            <div key={p} style={{ position: 'absolute', left: 0, right: 0, bottom: `${p * 100}%`, height: 1, background: 'var(--border)' }} />
          ))}
          {/* fill */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${value * 100}%`, background: `linear-gradient(0deg, ${color}, color-mix(in oklch, ${color} 55%, transparent))`, transition: 'height .05s' }} />
          {/* knob */}
          <div style={{
            position: 'absolute', left: '50%', bottom: `${value * 100}%`, transform: 'translate(-50%, 50%)',
            width: 56, height: 26, borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--border)',
            boxShadow: '0 3px 10px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 16, height: 1.5, background: 'var(--text-faint)', borderRadius: 2 }} />)}
          </div>
          {locked && (
            <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', fontSize: 13 }}>🔒</div>
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{Math.round(value * 100)}<span style={{ fontSize: 12, color: 'var(--text-dim)' }}>%</span></div>
          <div style={{ fontSize: 13, fontWeight: 700, color, marginTop: 2 }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{sub}</div>
        </div>
      </div>
    );
  }

  function MixerScreen({ app }) {
    const { musicVol, setMusicVol, metVol, setMetVol, autoDuck, setAutoDuck,
            mixPreview, toggleMixPreview, track } = app;

    return (
      <div style={{ padding: '8px 18px 28px', display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
        <header style={{ paddingTop: 4 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: -0.8, color: 'var(--text)' }}>Mixer</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--text-dim)', maxWidth: 280 }}>
            Equilibre música e metrônomo. O bip deve guiar suas pisadas.
          </p>
        </header>

        <div style={{ flex: 1, display: 'flex', gap: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '22px 20px', minHeight: 0 }}>
          <VFader value={musicVol} onChange={setMusicVol} color="var(--music)" label="Música" sub={track ? track.title : '—'} icon="note" locked={autoDuck} />
          <div style={{ width: 1, background: 'var(--border)' }} />
          <VFader value={metVol} onChange={setMetVol} color="var(--accent)" label="Metrônomo" sub="o seu pulso" icon="pulse" />
        </div>

        {/* auto-duck */}
        <button onClick={() => setAutoDuck(!autoDuck)} style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18, cursor: 'pointer',
          textAlign: 'left', width: '100%', fontFamily: 'inherit',
          background: autoDuck ? 'color-mix(in oklch, var(--accent) 12%, var(--surface))' : 'var(--surface)',
          border: '1px solid', borderColor: autoDuck ? 'color-mix(in oklch, var(--accent) 50%, transparent)' : 'var(--border)',
        }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', flexShrink: 0 }}>
            <Icon name="sliderH" size={20} stroke="var(--accent-text)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Bip sempre audível</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>Limita a música abaixo do metrônomo</div>
          </div>
          <div style={{
            width: 50, height: 30, borderRadius: 999, flexShrink: 0, position: 'relative', transition: 'background .2s',
            background: autoDuck ? 'var(--accent)' : 'var(--border)',
          }}>
            <span style={{
              position: 'absolute', top: 3, left: autoDuck ? 23 : 3, width: 24, height: 24, borderRadius: '50%',
              background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
            }} />
          </div>
        </button>

        {/* preview */}
        <button onClick={toggleMixPreview} style={{
          padding: 16, borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
          border: '1px solid var(--border)',
          background: mixPreview ? 'var(--surface-2)' : 'transparent', color: 'var(--text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <Icon name={mixPreview ? 'pause' : 'play'} size={18} stroke="var(--text)" />
          {mixPreview ? 'Parar prévia' : 'Ouvir o equilíbrio'}
        </button>
      </div>
    );
  }

  Object.assign(window, { MusicasScreen, MixerScreen });
})();
