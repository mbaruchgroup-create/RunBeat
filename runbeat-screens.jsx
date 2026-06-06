// runbeat-screens.jsx — Ritmo (setup) + Correr (live session)
// Exports (to window): RitmoScreen, CorrerScreen, Stepper, Stat

(function () {
  const { Icon, Cover, Seg } = window;

  // ── reusable stepper ───────────────────────────────────────────────────
  function Stepper({ onDec, onInc }) {
    const btn = {
      width: 52, height: 52, borderRadius: 16, border: '1px solid var(--border)',
      background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer',
      fontSize: 26, fontWeight: 400, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0,
    };
    return (
      <React.Fragment>
        <button style={btn} onClick={onDec} aria-label="menos">–</button>
        <button style={btn} onClick={onInc} aria-label="mais">+</button>
      </React.Fragment>
    );
  }

  function Stat({ label, value, unit, big }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: big ? 30 : 22, fontWeight: 600, color: 'var(--text)', lineHeight: 1, letterSpacing: -0.5 }}>
          {value}<span style={{ fontSize: big ? 14 : 12, color: 'var(--text-dim)', marginLeft: 3, fontWeight: 500 }}>{unit}</span>
        </span>
      </div>
    );
  }

  // ── Cadence band gauge (150–190, recommended 160–180) ───────────────────
  function CadenceGauge({ spm, onChange }) {
    const MIN = 150, MAX = 190;
    const pct = ((spm - MIN) / (MAX - MIN)) * 100;
    const trackRef = React.useRef(null);
    const setFromX = (clientX) => {
      const r = trackRef.current.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      onChange(Math.round(MIN + p * (MAX - MIN)));
    };
    const onDown = (e) => {
      e.preventDefault();
      const move = (ev) => setFromX((ev.touches ? ev.touches[0] : ev).clientX);
      move(e.nativeEvent);
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    return (
      <div>
        <div ref={trackRef} onPointerDown={onDown} style={{
          position: 'relative', height: 46, borderRadius: 12, cursor: 'pointer',
          background: 'var(--surface-2)', border: '1px solid var(--border)', overflow: 'hidden', touchAction: 'none',
        }}>
          {/* recommended band 160–180 */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${((160 - MIN) / (MAX - MIN)) * 100}%`,
            width: `${((180 - 160) / (MAX - MIN)) * 100}%`,
            background: 'color-mix(in oklch, var(--accent) 16%, transparent)',
            borderLeft: '1px dashed color-mix(in oklch, var(--accent) 50%, transparent)',
            borderRight: '1px dashed color-mix(in oklch, var(--accent) 50%, transparent)',
          }} />
          {/* fill */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'color-mix(in oklch, var(--accent) 22%, transparent)' }} />
          {/* knob */}
          <div style={{
            position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%,-50%)',
            width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)',
            boxShadow: '0 2px 8px rgba(0,0,0,.35)', border: '3px solid var(--surface)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
          <span>150</span>
          <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>160–180 recomendado</span>
          <span>190</span>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // RITMO — setup
  // ════════════════════════════════════════════════════════════════════════
  function RitmoScreen({ app }) {
    const { mode, setMode, paceSec, setPaceSec, speedKmh, setSpeedKmh,
            goalDist, setGoalDist, goalTime, setGoalTime, cadence, setCadence,
            effectiveSpeed, effectivePace, track } = app;
    const stride = window.strideFor(effectiveSpeed, cadence);

    const card = {
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 22, padding: 20,
    };
    const bigVal = { fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text)', letterSpacing: -1, lineHeight: 1 };

    return (
      <div style={{ padding: '8px 18px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ paddingTop: 4 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--accent-text)', fontWeight: 700 }}>RunBeat</div>
          <h1 style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 700, letterSpacing: -0.8, color: 'var(--text)' }}>Defina seu ritmo</h1>
        </header>

        <Seg
          value={mode}
          onChange={setMode}
          options={[{ value: 'pace', label: 'Pace' }, { value: 'speed', label: 'Velocidade' }, { value: 'goal', label: 'Meta' }]}
        />

        {/* primary input */}
        <div style={card}>
          {mode === 'pace' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600, marginBottom: 6 }}>Pace alvo</div>
                <div style={{ ...bigVal, fontSize: 56 }}>{window.fmtPace(paceSec)}<span style={{ fontSize: 18, color: 'var(--text-dim)', marginLeft: 6, fontFamily: 'var(--ui)', fontWeight: 500 }}>/km</span></div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>≈ {effectiveSpeed.toFixed(1)} km/h</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Stepper onDec={() => setPaceSec(Math.min(540, paceSec + 5))} onInc={() => setPaceSec(Math.max(180, paceSec - 5))} />
              </div>
            </div>
          )}
          {mode === 'speed' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600, marginBottom: 6 }}>Velocidade alvo</div>
                <div style={{ ...bigVal, fontSize: 56 }}>{speedKmh.toFixed(1)}<span style={{ fontSize: 18, color: 'var(--text-dim)', marginLeft: 6, fontFamily: 'var(--ui)', fontWeight: 500 }}>km/h</span></div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>≈ {window.fmtPace(window.speedToPace(speedKmh))} /km</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Stepper onDec={() => setSpeedKmh(Math.max(6, +(speedKmh - 0.1).toFixed(1)))} onInc={() => setSpeedKmh(Math.min(20, +(speedKmh + 0.1).toFixed(1)))} />
              </div>
            </div>
          )}
          {mode === 'goal' && (
            <div>
              <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600, marginBottom: 10 }}>Distância</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                {[{ d: 5, l: '5K' }, { d: 10, l: '10K' }, { d: 21.1, l: '21K' }, { d: 42.2, l: '42K' }].map((o) => {
                  const active = Math.abs(goalDist - o.d) < 0.05;
                  return (
                    <button key={o.l} onClick={() => setGoalDist(o.d)} style={{
                      flex: 1, padding: '11px 4px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 15, fontWeight: 700, border: '1px solid', transition: 'all .15s',
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? 'var(--ink)' : 'var(--text-dim)',
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                    }}>{o.l}</button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600, marginBottom: 6 }}>Tempo objetivo</div>
                  <div style={{ ...bigVal, fontSize: 46 }}>{window.fmtClock(goalTime)}</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>pace {window.fmtPace(goalTime / goalDist)} /km · {effectiveSpeed.toFixed(1)} km/h</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Stepper onDec={() => setGoalTime(Math.max(300, goalTime - 30))} onInc={() => setGoalTime(goalTime + 30)} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* cadence */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600 }}>Cadência alvo</div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-dim)' }}>cada bip = uma pisada</div>
            </div>
            <div style={{ ...bigVal, fontSize: 50, color: 'var(--accent-text)' }}>{cadence}<span style={{ fontSize: 15, color: 'var(--text-dim)', marginLeft: 5, fontFamily: 'var(--ui)', fontWeight: 500 }}>spm</span></div>
          </div>
          <CadenceGauge spm={cadence} onChange={(v) => setCadence(Math.max(150, Math.min(190, v)))} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <Stat label="Passada" value={stride.toFixed(2)} unit="m" />
            <Stat label="Ritmo" value={effectiveSpeed.toFixed(1)} unit="km/h" />
            <Stat label="Pace" value={window.fmtPace(effectivePace)} unit="/km" />
          </div>
        </div>

        {/* suggested track */}
        {track && (
          <button onClick={() => app.setTab('musicas')} style={{
            ...card, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left',
            width: '100%', fontFamily: 'inherit',
          }}>
            <Cover track={track} size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--music)', fontWeight: 700 }}>Trilha no BPM</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{track.artist} · {track.bpm} BPM</div>
            </div>
            <Icon name="chevron" size={18} stroke="var(--text-faint)" />
          </button>
        )}

        <button onClick={app.startRun} style={{
          marginTop: 4, padding: '18px', borderRadius: 18, border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: 'var(--ink)', fontFamily: 'inherit',
          fontSize: 17, fontWeight: 800, letterSpacing: 0.3, display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: '0 8px 24px color-mix(in oklch, var(--accent) 35%, transparent)',
        }}>
          <Icon name="play" size={20} stroke="var(--ink)" /> Iniciar corrida
        </button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // CORRER — live session
  // ════════════════════════════════════════════════════════════════════════
  function CorrerScreen({ app }) {
    const { running, started, elapsed, distance, cadence, effectivePace, track,
            musicPlaying } = app;
    const beat = window.useBeat();

    if (!started) {
      return (
        <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: 22 }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)' }}>
            <Icon name="pulse" size={44} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Pronto para correr</h2>
            <p style={{ margin: '8px 0 0', fontSize: 14.5, color: 'var(--text-dim)', maxWidth: 240 }}>
              Cadência <b style={{ color: 'var(--accent-text)', fontFamily: 'var(--mono)' }}>{cadence} spm</b> · pace {window.fmtPace(effectivePace)} /km
            </p>
          </div>
          <button onClick={app.startRun} style={{
            padding: '16px 40px', borderRadius: 16, border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: 'var(--ink)', fontFamily: 'inherit',
            fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: '0 8px 24px color-mix(in oklch, var(--accent) 35%, transparent)',
          }}><Icon name="play" size={18} stroke="var(--ink)" /> Iniciar</button>
        </div>
      );
    }

    const foot = beat % 2 === 0 ? 'E' : 'D'; // esquerdo / direito

    return (
      <div style={{ padding: '6px 20px 18px', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* top stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px 0' }}>
          <Stat label="Tempo" value={window.fmtClock(elapsed)} big />
          <Stat label="Distância" value={distance.toFixed(2)} unit="km" big />
          <Stat label="Pace" value={window.fmtPace(effectivePace)} unit="/km" big />
        </div>

        {/* beat ring */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 0 }}>
          <div style={{ position: 'relative', width: 256, height: 256, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* expanding pulse, retriggered each beat */}
            {running && <div key={beat} className="beat-pulse" />}
            <div style={{
              position: 'absolute', inset: 30, borderRadius: '50%',
              border: '2px solid var(--border)',
            }} />
            <div style={{
              position: 'absolute', inset: 30, borderRadius: '50%',
              border: '3px solid var(--accent)', opacity: running ? 1 : 0.4,
              boxShadow: running ? '0 0 30px color-mix(in oklch, var(--accent) 40%, transparent)' : 'none',
              transform: running ? 'scale(1)' : 'scale(0.96)', transition: 'transform .2s',
            }} />
            <div style={{ textAlign: 'center', position: 'relative' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 76, fontWeight: 700, color: 'var(--text)', letterSpacing: -3, lineHeight: 0.9 }}>{cadence}</div>
              <div style={{ fontSize: 13, letterSpacing: 3, color: 'var(--text-faint)', fontWeight: 700, marginTop: 2 }}>SPM</div>
              <div style={{
                marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '5px 12px', borderRadius: 999, background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}>
                <span style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: running ? 'var(--accent)' : 'var(--text-faint)',
                }} />
                <span style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600 }}>
                  {running ? `pisada ${foot === 'E' ? 'esquerda' : 'direita'}` : 'pausado'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* now playing */}
        {track && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16,
            background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 12,
          }}>
            <Cover track={track} size={44} radius={10} playing={musicPlaying && running} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{track.artist} · {track.bpm} BPM</div>
            </div>
            <button onClick={app.toggleMusic} style={iconBtn}>
              <Icon name={musicPlaying ? 'pause' : 'play'} size={20} stroke="var(--text)" />
            </button>
            <button onClick={app.nextTrack} style={iconBtn}>
              <Icon name="next" size={20} stroke="var(--text)" />
            </button>
          </div>
        )}

        {/* transport */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={app.toggleRun} style={{
            flex: 1, padding: 16, borderRadius: 16, border: '1px solid var(--border)', cursor: 'pointer',
            background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'inherit',
            fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          }}>
            <Icon name={running ? 'pause' : 'play'} size={18} stroke="var(--text)" />
            {running ? 'Pausar' : 'Continuar'}
          </button>
          <button onClick={app.stopRun} style={{
            padding: '16px 22px', borderRadius: 16, border: 'none', cursor: 'pointer',
            background: 'color-mix(in oklch, #ef4444 88%, var(--bg))', color: '#fff', fontFamily: 'inherit',
            fontSize: 16, fontWeight: 700,
          }}>Encerrar</button>
        </div>
      </div>
    );
  }

  const iconBtn = {
    width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
    background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };

  Object.assign(window, { RitmoScreen, CorrerScreen, Stepper, Stat });
})();
