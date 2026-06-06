import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { createAudioPlayer, requestNotificationPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { Track, MetronomeSound } from '../types';
import { createMetronomeLoop, createTrackLoop } from './wav';

type AudioOptions = {
  cadence: number;
  metronomeSound: MetronomeSound;
  metronomeVolume: number;
  musicVolume: number;
  musicTrack: Track | null;
  shouldPlayMetronome: boolean;
  shouldPlayMusic: boolean;
};

const cache = new Map<string, string>();
let configured = false;
let permissionRequested = false;

async function ensureAudioMode() {
  if (configured) return;

  await setAudioModeAsync({
    shouldPlayInBackground: true,
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    interruptionModeAndroid: 'duckOthers',
  });

  if (Platform.OS === 'android' && !permissionRequested) {
    permissionRequested = true;
    try {
      await requestNotificationPermissionsAsync();
    } catch {
      // Playback still works without this; only the media notification may be missing.
    }
  }

  configured = true;
}

async function ensureCachedFile(key: string, bytes: Uint8Array) {
  const cached = cache.get(key);
  if (cached) return cached;

  const file = new File(Paths.cache, `runbeat-${key}.wav`);
  const info = file.info();

  if (!info.exists) {
    file.create({ overwrite: true, intermediates: true });
    file.write(bytes);
  }

  cache.set(key, file.uri);
  return file.uri;
}

export function useRunBeatAudio(options: AudioOptions) {
  const metronomePlayer = useMemo(
    () => createAudioPlayer(null, { keepAudioSessionActive: true, updateInterval: 250 }),
    []
  );
  const musicPlayer = useMemo(
    () => createAudioPlayer(null, { keepAudioSessionActive: true, updateInterval: 250 }),
    []
  );

  const lastMetronomeKey = useRef('');
  const lastMusicKey = useRef('');

  useEffect(() => {
    metronomePlayer.loop = true;
    musicPlayer.loop = true;

    return () => {
      try {
        metronomePlayer.pause();
        metronomePlayer.remove();
      } catch {
        // no-op
      }

      try {
        musicPlayer.pause();
        musicPlayer.remove();
      } catch {
        // no-op
      }
    };
  }, [metronomePlayer, musicPlayer]);

  useEffect(() => {
    void ensureAudioMode();
  }, []);

  useEffect(() => {
    metronomePlayer.volume = options.metronomeVolume;
  }, [metronomePlayer, options.metronomeVolume]);

  useEffect(() => {
    musicPlayer.volume = options.musicVolume;
  }, [musicPlayer, options.musicVolume]);

  useEffect(() => {
    const key = `met-${options.cadence}-${options.metronomeSound}`;
    if (lastMetronomeKey.current === key) return;

    lastMetronomeKey.current = key;
    void ensureCachedFile(key, createMetronomeLoop(options.cadence, options.metronomeSound)).then((uri) => {
      metronomePlayer.replace(uri);
      if (options.shouldPlayMetronome) {
        metronomePlayer.play();
      }
    });
  }, [metronomePlayer, options.cadence, options.metronomeSound, options.shouldPlayMetronome]);

  useEffect(() => {
    if (!options.musicTrack) return;
    const key = `track-${options.musicTrack.id}`;
    if (lastMusicKey.current === key) return;

    lastMusicKey.current = key;
    void ensureCachedFile(key, createTrackLoop(options.musicTrack)).then((uri) => {
      musicPlayer.replace(uri);
      if (options.shouldPlayMusic) {
        musicPlayer.play();
      }
    });
  }, [musicPlayer, options.musicTrack, options.shouldPlayMusic]);

  useEffect(() => {
    if (!options.shouldPlayMetronome) {
      metronomePlayer.pause();
      return;
    }

    metronomePlayer.play();
    metronomePlayer.setActiveForLockScreen(
      !options.shouldPlayMusic,
      {
        title: `RunBeat ${options.cadence} BPM`,
        artist: 'Metronomo de corrida',
        albumTitle: 'RunBeat',
      },
      {
        showSeekBackward: false,
        showSeekForward: false,
        isLiveStream: true,
      }
    );
  }, [metronomePlayer, options.cadence, options.shouldPlayMetronome, options.shouldPlayMusic]);

  useEffect(() => {
    if (!options.shouldPlayMusic || !options.musicTrack) {
      musicPlayer.pause();
      if (!options.shouldPlayMetronome) {
        musicPlayer.clearLockScreenControls();
      }
      return;
    }

    musicPlayer.play();
    musicPlayer.setActiveForLockScreen(
      true,
      {
        title: options.musicTrack.title,
        artist: options.musicTrack.artist,
        albumTitle: `RunBeat ${options.musicTrack.bpm} BPM`,
      },
      {
        showSeekBackward: false,
        showSeekForward: false,
      }
    );
  }, [musicPlayer, options.musicTrack, options.shouldPlayMetronome, options.shouldPlayMusic]);

  return {
    metronomePlayer,
    musicPlayer,
  };
}
