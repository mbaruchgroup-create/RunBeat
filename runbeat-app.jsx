// runbeat-app.jsx — App root: state, audio wiring, tweaks
(function () {
  const { IOSDevice, TabBar, RitmoScreen, CorrerScreen, MusicasScreen, MixerScreen } = window;
  const { useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakRadio, TweakColor, TweakButton } = window;

  const ACCENTS = {
    lima:    { accent: 'oklch(0.88 0.21 128)', tDark: 'oklch(0.88 0.21 128)', tLight: 'oklch(0.52 0.15 132)', ink: 'oklch(0.24 0.05 130)', sw: '#b6f23a' },
    ciano:   { accent: 'oklch(0.82 0.14 205)', tDark: 'oklch(0.84 0.13 205)', tLight: 'oklch(0.50 0.11 220)', ink: 'oklch(0.20 0.04 220)', sw: '#34d6e8' },
    laranja: { accent: 'oklch(0.78 0.17 55)',  tDark: 'oklch(0.82 0.16 60)',  tLight: 'oklch(0.55 0.16 50)',  ink: 'oklch(0.24 0.05 50)',  sw: '#ff8a3d' },
    violeta: { accent: 'oklch(0.74 0.16 300)', tDark: 'oklch(0.80 0.15 300)', tLight: 'oklch(0.52 0.16 300)', ink: 'oklch(0.22 0.05 300)', sw: '#b07bff' },
  };

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "dark": true,
    "accent": "lima",
    "metSound": "click"
  }/*EDITMODE-END*/;

  function App() {
    const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

    const [tab, setTab] = React.useState('ritmo');
    const [mode, setMode] = React.useState('pace');
    const [paceSec, setPaceSec] = React.useState(330);  // 5:30 /km
    const [speedKmh, setSpeedKmh] = React.useState(11.0);
    const [goalDist, setGoalDist] = React.useState(5);
    const [goalTime, setGoalTime] = React.useState(1620); // 27:00
    const [cadence, setCadence] = React.useState(172);
    const [tol, setTol] = React.useState(4);
    const [selectedTrackId, setSelectedTrackId] = React.useState('t7');

    const [musicVol, _setMusicVol] = React.useState(0.45);
    const [metVol, _setMetVol] = React.useState(0.9);
    const [autoDuck, _setAutoDuck] = React.useState(true);

    const [started, setStarted] = React.useState(false);
    const [running, setRunning] = React.useState(false);
    const [mixPreview, setMixPreview] = React.useState(false);
    const [musicPlaying, setMusicPlaying] = React.useState(true);
    const [elapsed, setElapsed] = React.useState(0);
    const [distance, setDistance] = React.useState(0);

    const track = window.TRACKS.find((x) => x.id === selectedTrackId);

    // derived effort
    let effectiveSpeed, effectivePace;
    if (mode === 'pace') { effectivePace = paceSec; effectiveSpeed = window.paceToSpeed(paceSec); }
    else if (mode === 'speed') { effectiveSpeed = speedKmh; effectivePace = window.speedToPace(speedKmh); }
    else { effectivePace = goalTime / goalDist; effectiveSpeed = window.paceToSpeed(effectivePace); }

    // duck-aware volume setters
    const setMusicVol = (v) => _setMusicVol(autoDuck ? Math.min(v, +(metVol * 0.8).toFixed(2)) : v);
    const setMetVol = (v) => { _setMetVol(v); if (autoDuck && musicVol > v * 0.8) _setMusicVol(+(v * 0.8).toFixed(2)); };
    const setAutoDuck = (b) => { _setAutoDuck(b); if (b && musicVol > metVol * 0.8) _setMusicVol(+(metVol * 0.8).toFixed(2)); };

    // ── audio wiring ─────────────────────────────────────────────────────
    React.useEffect(() => { window.getAudio().MetronomeEngine.setVolume(metVol); }, [metVol]);
    React.useEffect(() => { window.getAudio().MusicEngine.setVolume(musicVol); }, [musicVol]);
    React.useEffect(() => { window.getAudio().MetronomeEngine.setBpm(cadence); }, [cadence]);
    React.useEffect(() => { window.getAudio().MetronomeEngine.setSound(t.metSound); }, [t.metSound]);

    const metActive = running || mixPreview;
    const musActive = musicPlaying && (running || mixPreview);

    React.useEffect(() => {
      const { MetronomeEngine } = window.getAudio();
      if (metActive) MetronomeEngine.start(); else MetronomeEngine.stop();
    }, [metActive]);

    React.useEffect(() => {
      const { MusicEngine } = window.getAudio();
      MusicEngine.stop();
      if (musActive && track) { MusicEngine.load(track); MusicEngine.start(); }
    }, [musActive, track && track.id]);

    // session timer
    const speedRef = React.useRef(effectiveSpeed);
    speedRef.current = effectiveSpeed;
    React.useEffect(() => {
      if (!running) return;
      const id = setInterval(() => {
        setElapsed((e) => e + 1);
        setDistance((d) => d + speedRef.current / 3600);
      }, 1000);
      return () => clearInterval(id);
    }, [running]);

    // ── actions ──────────────────────────────────────────────────────────
    const startRun = () => { setMixPreview(false); setStarted(true); setRunning(true); setTab('correr'); };
    const toggleRun = () => setRunning((r) => !r);
    const stopRun = () => { setRunning(false); setStarted(false); setMixPreview(false); setElapsed(0); setDistance(0); };
    const toggleMusic = () => setMusicPlaying((p) => !p);
    const toggleMixPreview = () => setMixPreview((p) => !p);
    const selectTrack = (id) => { setSelectedTrackId(id); setMusicPlaying(true); };
    const nextTrack = () => {
      const sorted = [...window.TRACKS].sort((a, b) => Math.abs(a.bpm - cadence) - Math.abs(b.bpm - cadence));
      const i = sorted.findIndex((x) => x.id === selectedTrackId);
      setSelectedTrackId(sorted[(i + 1) % sorted.length].id);
      setMusicPlaying(true);
    };

    const app = {
      tab, setTab, mode, setMode, paceSec, setPaceSec, speedKmh, setSpeedKmh,
      goalDist, setGoalDist, goalTime, setGoalTime, cadence, setCadence, tol, setTol,
      track, selectTrack, nextTrack, musicVol, setMusicVol, metVol, setMetVol,
      autoDuck, setAutoDuck, started, running, mixPreview, musicPlaying,
      elapsed, distance, effectiveSpeed, effectivePace,
      startRun, toggleRun, stopRun, toggleMusic, toggleMixPreview,
    };

    const a = ACCENTS[t.accent] || ACCENTS.lima;
    const accentVars = {
      '--accent': a.accent,
      '--accent-text': t.dark ? a.tDark : a.tLight,
      '--ink': a.ink,
    };

    const screen = tab === 'ritmo' ? <RitmoScreen app={app} />
      : tab === 'correr' ? <CorrerScreen app={app} />
      : tab === 'musicas' ? <MusicasScreen app={app} />
      : <MixerScreen app={app} />;

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box' }}>
        <IOSDevice dark={t.dark} width={402} height={874}>
          <div className="rb-root" data-theme={t.dark ? 'dark' : 'light'} style={accentVars}>
            <main className="rb-scroll">{screen}</main>
            <TabBar tab={tab} setTab={setTab} />
          </div>
        </IOSDevice>

        <TweaksPanel title="Tweaks">
          <TweakSection label="Aparência" />
          <TweakToggle label="Tema escuro" value={t.dark} onChange={(v) => setTweak('dark', v)} />
          <TweakColor label="Cor de destaque" value={a.sw}
            options={[ACCENTS.lima.sw, ACCENTS.ciano.sw, ACCENTS.laranja.sw, ACCENTS.violeta.sw]}
            onChange={(hex) => {
              const key = Object.keys(ACCENTS).find((k) => ACCENTS[k].sw === hex) || 'lima';
              setTweak('accent', key);
            }} />
          <TweakSection label="Metrônomo" />
          <TweakRadio label="Som do bip" value={t.metSound}
            options={['click', 'wood', 'beep', 'kick']}
            onChange={(v) => { setTweak('metSound', v); window.getAudio().MetronomeEngine.setSound(v); window.getAudio().MetronomeEngine.preview(); }} />
          <TweakButton label="Testar som" onClick={() => window.getAudio().MetronomeEngine.preview()}>Tocar bip</TweakButton>
        </TweaksPanel>
      </div>
    );
  }

  window.RunBeatApp = App;
})();
