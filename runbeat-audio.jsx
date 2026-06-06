// runbeat-audio.jsx — Web Audio engines for RunBeat
// Exports (to window): getAudio, useBeat, useMusicStep
// One shared AudioContext drives:
//   • MetronomeEngine — a click on every footstep (cadence BPM), real, with sound styles
//   • MusicEngine     — a synthesized looping groove at a track's BPM so the Mixer
//                       genuinely demonstrates music-vs-metronome balance.

(function () {
  let ctx = null;
  let master = null;
  let metGain = null;
  let musGain = null;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    metGain = ctx.createGain();
    metGain.gain.value = 0.9;
    metGain.connect(master);

    musGain = ctx.createGain();
    musGain.gain.value = 0.55;
    // gentle softening lowpass for the synth track
    const musFilter = ctx.createBiquadFilter();
    musFilter.type = 'lowpass';
    musFilter.frequency.value = 5200;
    musGain.connect(musFilter);
    musFilter.connect(master);
    MusicEngine.out = musGain;
    return ctx;
  }

  // ── Sound synthesis for the metronome click ────────────────────────────
  function clickSound(t, style, gainNode) {
    const c = ctx;
    if (style === 'kick') {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
      g.gain.setValueAtTime(1.0, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(gainNode);
      o.start(t); o.stop(t + 0.18);
      return;
    }
    if (style === 'beep') {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(1660, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g); g.connect(gainNode);
      o.start(t); o.stop(t + 0.07);
      return;
    }
    if (style === 'wood') {
      [1300, 760].forEach((f, i) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, t);
        const peak = i === 0 ? 0.6 : 0.35;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        o.connect(g); g.connect(gainNode);
        o.start(t); o.stop(t + 0.05);
      });
      return;
    }
    // default: dry classic click (filtered noise burst)
    const dur = 0.03;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = c.createBufferSource();
    src.buffer = buf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1400;
    const g = c.createGain();
    g.gain.value = 0.9;
    src.connect(hp); hp.connect(g); g.connect(gainNode);
    src.start(t);
  }

  // ── Metronome engine ───────────────────────────────────────────────────
  const MetronomeEngine = {
    bpm: 172, sound: 'click', running: false,
    nextTime: 0, beat: 0, queue: [], timer: null,
    listeners: new Set(),

    start() {
      ensureCtx();
      if (ctx.state === 'suspended') ctx.resume();
      if (this.running) return;
      this.running = true;
      this.nextTime = ctx.currentTime + 0.06;
      this.beat = 0;
      this.timer = setInterval(() => this._sched(), 25);
      this._raf();
    },
    stop() {
      this.running = false;
      clearInterval(this.timer);
      this.timer = null;
      this.queue = [];
    },
    setBpm(v) { this.bpm = v; },
    setSound(s) { this.sound = s; },
    setVolume(v) { ensureCtx(); metGain.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
    preview() {
      ensureCtx();
      if (ctx.state === 'suspended') ctx.resume();
      clickSound(ctx.currentTime + 0.02, this.sound, metGain);
    },
    _sched() {
      const spb = 60 / this.bpm;
      while (this.nextTime < ctx.currentTime + 0.12) {
        clickSound(this.nextTime, this.sound, metGain);
        this.queue.push({ t: this.nextTime, beat: this.beat });
        this.nextTime += spb;
        this.beat++;
      }
    },
    _raf() {
      const tick = () => {
        if (!this.running) return;
        const now = ctx.currentTime;
        while (this.queue.length && this.queue[0].t <= now) {
          const b = this.queue.shift();
          this.listeners.forEach((fn) => fn(b.beat));
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
  };

  // ── Music engine — synthesized looping groove ──────────────────────────
  // A track = { bpm, root (Hz of tonic), bass[], arp[] } stepped in eighth notes.
  const MusicEngine = {
    out: null, bpm: 172, running: false,
    nextTime: 0, step: 0, timer: null,
    track: null, listeners: new Set(),

    // 16-step (2 bar) patterns. Numbers = scale degrees (minor), null = rest.
    // bass uses octave below tonic; arp a soft pluck above.
    patterns: {
      drive:   { bass: [0,null,0,null,5,null,3,null,0,null,0,null,7,null,5,null],
                 arp:  [12,15,19,15,12,15,19,22,12,15,19,15,17,19,22,19] },
      pulse:   { bass: [0,0,null,0,3,3,null,3,5,5,null,5,7,null,7,null],
                 arp:  [12,null,15,null,19,null,15,null,17,null,20,null,19,null,15,null] },
      glide:   { bass: [0,null,null,null,5,null,null,null,3,null,null,null,7,null,5,null],
                 arp:  [19,22,24,22,19,22,24,27,17,20,24,20,19,22,24,22] },
    },

    minorSemis: [0,2,3,5,7,8,10,12,14,15,17,19,22,24,27],

    degToFreq(root, deg) {
      const oct = Math.floor(deg / 7);
      const idx = ((deg % 7) + 7) % 7;
      const semis = [0,2,3,5,7,8,10][idx] + 12 * oct;
      return root * Math.pow(2, semis / 12);
    },

    load(track) {
      this.track = track;
      this.bpm = track.bpm;
      this.step = 0;
    },
    start() {
      ensureCtx();
      if (ctx.state === 'suspended') ctx.resume();
      if (this.running || !this.track) return;
      this.running = true;
      this.nextTime = ctx.currentTime + 0.08;
      this.step = 0;
      this.timer = setInterval(() => this._sched(), 25);
      this._raf();
    },
    stop() {
      this.running = false;
      clearInterval(this.timer);
      this.timer = null;
    },
    setVolume(v) { ensureCtx(); musGain.gain.setTargetAtTime(v, ctx.currentTime, 0.03); },

    _bass(t, freq) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq / 2, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + 0.3);
    },
    _pluck(t, freq) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3200, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + 0.18);
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(lp); lp.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + 0.24);
    },
    _sched() {
      const stepDur = (60 / this.bpm) / 2; // eighth notes
      const pat = this.patterns[this.track.pattern] || this.patterns.drive;
      while (this.nextTime < ctx.currentTime + 0.12) {
        const s = this.step % 16;
        const bd = pat.bass[s];
        const ad = pat.arp[s];
        if (bd !== null && bd !== undefined) this._bass(this.nextTime, this.degToFreq(this.track.root, bd));
        if (ad !== null && ad !== undefined) this._pluck(this.nextTime, this.degToFreq(this.track.root, ad));
        this.nextTime += stepDur;
        this.step++;
      }
    },
    _raf() {
      const tick = () => {
        if (!this.running) return;
        this.listeners.forEach((fn) => fn(this.step));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
  };

  window.getAudio = function () {
    ensureCtx();
    return { ctx, MetronomeEngine, MusicEngine };
  };

  // React hook: subscribe to metronome beats for visual pulse
  window.useBeat = function () {
    const [beat, setBeat] = React.useState(-1);
    React.useEffect(() => {
      const fn = (b) => setBeat(b);
      MetronomeEngine.listeners.add(fn);
      return () => MetronomeEngine.listeners.delete(fn);
    }, []);
    return beat;
  };
})();
