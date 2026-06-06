import { AppSettings, Track } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  heightCm: 176,
  strideMeters: 1.02,
  metronomeSound: 'click',
  metronomeVolume: 0.92,
  musicVolume: 0.5,
  tolerance: 4,
  autoDuck: true,
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function paceToSpeed(paceSec: number) {
  return 3600 / paceSec;
}

export function speedToPace(speedKmh: number) {
  return 3600 / speedKmh;
}

export function formatPace(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function estimateStrideFromHeight(heightCm: number) {
  return clamp((heightCm / 100) * 0.58, 0.8, 1.3);
}

export function cadenceFromPace(paceSec: number, strideMeters: number) {
  const metersPerMinute = 1000 / (paceSec / 60);
  return Math.round(clamp(metersPerMinute / strideMeters, 150, 190));
}

export function strideFor(speedKmh: number, cadence: number) {
  const metersPerMinute = (speedKmh * 1000) / 60;
  return metersPerMinute / cadence;
}

export function effectiveStride(settings: AppSettings) {
  return clamp(settings.strideMeters || estimateStrideFromHeight(settings.heightCm), 0.8, 1.35);
}

export function getCadenceStatus(cadence: number) {
  if (cadence < 160) return 'Mais econômica com passada curta';
  if (cadence <= 180) return 'Faixa recomendada para corrida';
  return 'Alta rotação para tiros e ritmo forte';
}

export function getSuggestedTracks(tracks: Track[], cadence: number, tolerance: number) {
  return tracks
    .map((track) => ({ track, distance: Math.abs(track.bpm - cadence) }))
    .sort((left, right) => left.distance - right.distance)
    .filter((entry) => entry.distance <= tolerance);
}

export function getAllTracksSorted(tracks: Track[], cadence: number) {
  return tracks
    .map((track) => ({ track, distance: Math.abs(track.bpm - cadence) }))
    .sort((left, right) => left.distance - right.distance);
}
