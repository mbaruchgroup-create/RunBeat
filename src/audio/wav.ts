import { MetronomeSound, Track } from '../types';

const SAMPLE_RATE = 22050;

function createBuffer(length: number) {
  return new Float32Array(length);
}

function envelope(index: number, length: number, decay = 5) {
  return Math.exp((-decay * index) / length);
}

function addSine(buffer: Float32Array, start: number, duration: number, frequency: number, gain: number) {
  const length = Math.floor(duration * SAMPLE_RATE);
  for (let i = 0; i < length; i += 1) {
    const sampleIndex = start + i;
    if (sampleIndex >= buffer.length) break;
    const phase = (2 * Math.PI * frequency * i) / SAMPLE_RATE;
    buffer[sampleIndex] += Math.sin(phase) * gain * envelope(i, length, 7);
  }
}

function addNoise(buffer: Float32Array, start: number, duration: number, gain: number) {
  const length = Math.floor(duration * SAMPLE_RATE);
  for (let i = 0; i < length; i += 1) {
    const sampleIndex = start + i;
    if (sampleIndex >= buffer.length) break;
    buffer[sampleIndex] += (Math.random() * 2 - 1) * gain * envelope(i, length, 9);
  }
}

function addClick(buffer: Float32Array, timeSec: number, sound: MetronomeSound) {
  const start = Math.floor(timeSec * SAMPLE_RATE);

  switch (sound) {
    case 'kick':
      addSine(buffer, start, 0.16, 120, 0.95);
      addSine(buffer, start, 0.08, 62, 0.55);
      break;
    case 'beep':
      addSine(buffer, start, 0.05, 1560, 0.75);
      break;
    case 'wood':
      addSine(buffer, start, 0.035, 1160, 0.6);
      addSine(buffer, start + 14, 0.045, 720, 0.4);
      break;
    default:
      addNoise(buffer, start, 0.03, 0.7);
      addSine(buffer, start, 0.018, 2100, 0.18);
  }
}

function addBass(buffer: Float32Array, timeSec: number, rootFreq: number) {
  const start = Math.floor(timeSec * SAMPLE_RATE);
  addSine(buffer, start, 0.22, rootFreq * 0.5, 0.34);
  addSine(buffer, start, 0.14, rootFreq, 0.12);
}

function addPluck(buffer: Float32Array, timeSec: number, frequency: number, gain = 0.18) {
  const start = Math.floor(timeSec * SAMPLE_RATE);
  addSine(buffer, start, 0.12, frequency, gain);
  addSine(buffer, start, 0.1, frequency * 2, gain * 0.3);
}

function addHat(buffer: Float32Array, timeSec: number, gain = 0.12) {
  const start = Math.floor(timeSec * SAMPLE_RATE);
  addNoise(buffer, start, 0.02, gain);
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function toWavBytes(samples: Float32Array) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = SAMPLE_RATE * blockAlign;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

export function createMetronomeLoop(bpm: number, sound: MetronomeSound) {
  const beats = 16;
  const secondsPerBeat = 60 / bpm;
  const duration = beats * secondsPerBeat;
  const buffer = createBuffer(Math.ceil(duration * SAMPLE_RATE));

  for (let beat = 0; beat < beats; beat += 1) {
    addClick(buffer, beat * secondsPerBeat, sound);
  }

  return toWavBytes(buffer);
}

const ROOT_FREQUENCIES = {
  drive: 220,
  pulse: 246.94,
  glide: 196,
} as const;

const PATTERNS = {
  drive: {
    bass: [0, null, 0, null, 5, null, 3, null, 0, null, 0, null, 7, null, 5, null],
    arp: [12, 15, 19, 15, 12, 15, 19, 22, 12, 15, 19, 15, 17, 19, 22, 19],
  },
  pulse: {
    bass: [0, 0, null, 0, 3, 3, null, 3, 5, 5, null, 5, 7, null, 7, null],
    arp: [12, null, 15, null, 19, null, 15, null, 17, null, 20, null, 19, null, 15, null],
  },
  glide: {
    bass: [0, null, null, null, 5, null, null, null, 3, null, null, null, 7, null, 5, null],
    arp: [19, 22, 24, 22, 19, 22, 24, 27, 17, 20, 24, 20, 19, 22, 24, 22],
  },
} as const;

const SCALE = [0, 2, 3, 5, 7, 8, 10];

function degreeToFrequency(root: number, degree: number) {
  const octave = Math.floor(degree / 7);
  const index = ((degree % 7) + 7) % 7;
  const semitones = SCALE[index] + octave * 12;
  return root * Math.pow(2, semitones / 12);
}

export function createTrackLoop(track: Track) {
  const root = ROOT_FREQUENCIES[track.pattern];
  const stepDuration = (60 / track.bpm) / 2;
  const totalSteps = 32;
  const duration = totalSteps * stepDuration;
  const buffer = createBuffer(Math.ceil(duration * SAMPLE_RATE));
  const pattern = PATTERNS[track.pattern];

  for (let step = 0; step < totalSteps; step += 1) {
    const bassDegree = pattern.bass[step % 16];
    const arpDegree = pattern.arp[step % 16];
    const time = step * stepDuration;

    if (bassDegree !== null) {
      addBass(buffer, time, degreeToFrequency(root, bassDegree));
    }

    if (arpDegree !== null) {
      addPluck(buffer, time, degreeToFrequency(root, arpDegree), track.energy === 'push' ? 0.22 : 0.16);
    }

    addHat(buffer, time, track.energy === 'steady' ? 0.08 : 0.12);
  }

  return toWavBytes(buffer);
}
