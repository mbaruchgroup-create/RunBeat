export type AppTab = 'ritmo' | 'correr' | 'musicas' | 'config';

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
  durationText?: string;
  album?: string;
  thumbnailUrl?: string;
  bpmHint: number;
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
