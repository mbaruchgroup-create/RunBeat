import { RemoteSong, Track } from '../types';

export function makeYouTubeMusicSearchUrl(query: string) {
  return `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
}

export function makeCadenceQueries(bpm: number) {
  return [
    `${bpm} bpm running`,
    `${bpm} bpm running playlist`,
    `${bpm} bpm tempo run`,
    `${bpm} bpm cardio music`,
  ];
}

export function normalizeBackendUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

export function getSongArtists(song: RemoteSong) {
  return song.artists.join(', ');
}

export function buildPresetSongs(tracks: Track[]): RemoteSong[] {
  return tracks.map((track) => {
    const query = `${track.title} ${track.artist} ${track.bpm} bpm running`;
    const encoded = encodeURIComponent(query);
    return {
      id: `preset-${track.id}`,
      videoId: `preset-${track.id}`,
      title: track.title,
      artists: [track.artist],
      durationText: `${track.bpm} BPM`,
      album: 'RunBeat Preset',
      bpmHint: track.bpm,
      query,
      musicUrl: `https://music.youtube.com/search?q=${encoded}`,
      youtubeUrl: `https://www.youtube.com/results?search_query=${encoded}`,
    };
  });
}
