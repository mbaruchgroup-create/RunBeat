// runbeat-data.jsx — track catalog + running-math helpers
// Exports (to window): TRACKS, fmtPace, fmtClock, paceToSpeed, speedToPace,
//   strideFor, bpmMatch

(function () {
  // Synth-track catalog. root = tonic Hz for the music engine; pattern keys it.
  // Cover art is a placeholder gradient pair (c1/c2) — user swaps for real art later.
  const TRACKS = [
    { id: 't1',  title: 'Concrete Mirage',  artist: 'NOVUM',           bpm: 150, root: 220.00, pattern: 'glide', c1: '#0ea5a4', c2: '#155e63' },
    { id: 't2',  title: 'Afterburner',      artist: 'Kit Mercer',      bpm: 156, root: 246.94, pattern: 'pulse', c1: '#f97316', c2: '#7c2d12' },
    { id: 't3',  title: 'Low Orbit',        artist: 'Halsey Vane',     bpm: 160, root: 196.00, pattern: 'drive', c1: '#a3e635', c2: '#3f6212' },
    { id: 't4',  title: 'Night Cardio',     artist: 'The Pacers',      bpm: 164, root: 261.63, pattern: 'pulse', c1: '#22d3ee', c2: '#155e75' },
    { id: 't5',  title: 'Redline',          artist: 'SABLE',           bpm: 168, root: 233.08, pattern: 'drive', c1: '#f43f5e', c2: '#881337' },
    { id: 't6',  title: 'Heel Strike',      artist: 'Mara Cole',       bpm: 170, root: 207.65, pattern: 'glide', c1: '#8b5cf6', c2: '#4c1d95' },
    { id: 't7',  title: 'Tempo Run',        artist: 'Field Theory',    bpm: 172, root: 220.00, pattern: 'drive', c1: '#84cc16', c2: '#365314' },
    { id: 't8',  title: 'Split Times',      artist: 'OKAVA',           bpm: 174, root: 261.63, pattern: 'pulse', c1: '#06b6d4', c2: '#0e7490' },
    { id: 't9',  title: 'Forefoot',         artist: 'Dune Atlas',      bpm: 176, root: 246.94, pattern: 'drive', c1: '#eab308', c2: '#713f12' },
    { id: 't10', title: 'Negative Split',   artist: 'Lina Brandt',     bpm: 178, root: 196.00, pattern: 'glide', c1: '#ec4899', c2: '#831843' },
    { id: 't11', title: 'Cadence Lock',     artist: 'NOVUM',           bpm: 180, root: 233.08, pattern: 'pulse', c1: '#10b981', c2: '#065f46' },
    { id: 't12', title: 'Final 200',        artist: 'Kit Mercer',      bpm: 182, root: 277.18, pattern: 'drive', c1: '#f59e0b', c2: '#78350f' },
    { id: 't13', title: 'Overdrive',        artist: 'SABLE',           bpm: 184, root: 220.00, pattern: 'drive', c1: '#ef4444', c2: '#7f1d1d' },
    { id: 't14', title: 'Kick Push',        artist: 'Field Theory',    bpm: 186, root: 261.63, pattern: 'pulse', c1: '#3b82f6', c2: '#1e3a8a' },
  ];

  // pace stored as seconds per km
  function fmtPace(secPerKm) {
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function fmtClock(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  }
  function paceToSpeed(secPerKm) { return 3600 / secPerKm; }          // km/h
  function speedToPace(kmh) { return 3600 / kmh; }                    // sec/km
  // stride length (m) for a given speed (km/h) and cadence (spm)
  function strideFor(kmh, spm) {
    const mPerMin = (kmh * 1000) / 60;
    return mPerMin / spm;
  }
  function bpmMatch(trackBpm, target, tol) {
    return Math.abs(trackBpm - target) <= tol;
  }

  Object.assign(window, { TRACKS, fmtPace, fmtClock, paceToSpeed, speedToPace, strideFor, bpmMatch });
})();
