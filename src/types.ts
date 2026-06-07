export type AppTab = 'ritmo' | 'correr' | 'musicas' | 'treinos' | 'config';

export type InputMode = 'pace' | 'speed' | 'goal';

export type MetronomeSound = 'click' | 'wood' | 'beep' | 'kick';

export type TrackPattern = 'drive' | 'pulse' | 'glide';

export type Track = {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  energy: 'steady' | 'tempo' | 'push';
  c1: string;
  c2: string;
  pattern: TrackPattern;
};

export type AppSettings = {
  heightCm: number;
  strideMeters: number;
  metronomeSound: MetronomeSound;
  metronomeVolume: number;
  musicVolume: number;
  tolerance: number;
  autoDuck: boolean;
  backendUrl: string;
};

export type RemoteSong = {
  id: string;
  videoId: string;
  title: string;
  artists: string[];
  genres?: string[];
  subGenre?: string;
  durationText?: string;
  album?: string;
  thumbnailUrl?: string;
  bpmHint: number;
  effectiveBpm?: number;
  cadenceTarget?: number;
  cadenceMin?: number;
  cadenceMax?: number;
  energy?: number;
  mood?: string[];
  runningZone?: string;
  spotifyUrl?: string;
  tags?: string[];
  query: string;
  musicUrl: string;
  youtubeUrl: string;
};

export type RemotePlaylistBand = {
  id: string;
  label: string;
  bpm: number;
  description: string;
  items: RemoteSong[];
};

export type TrainingSegment = {
  minuteStart: number;
  minuteEnd: number;
  targetCadence: number;
};

export type TrainingPlan = {
  id: string;
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  durationMinutes: number;
  segments: TrainingSegment[];
  tagline?: string;
  goals?: string[];
};
