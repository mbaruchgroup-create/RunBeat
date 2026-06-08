import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { useRunBeatAudio } from './src/audio/useRunBeatAudio';
import { TRACKS } from './src/data/tracks';
import { AppSettings, AppTab, InputMode, RemotePlaylistBand, RemoteSong, Track, TrainingPlan } from './src/types';
import {
  DEFAULT_SETTINGS,
  MAX_CADENCE_BPM,
  MIN_CADENCE_BPM,
  RECOMMENDED_MAX_CADENCE_BPM,
  RECOMMENDED_MIN_CADENCE_BPM,
  cadenceFromPace,
  clamp,
  effectiveStride,
  estimateStrideFromHeight,
  formatClock,
  formatPace,
  getAllTracksSorted,
  getCadenceStatus,
  getSuggestedTracks,
  paceToSpeed,
  speedToPace,
  strideFor,
} from './src/utils/running';
import {
  buildPresetSongs,
  getSongArtists,
  makeCadenceQueries,
  makeYouTubeMusicSearchUrl,
  normalizeBackendUrl,
} from './src/utils/youtube';

const STORAGE_KEY = 'runbeat-settings-v2';
const VISUAL_BUILD_LABEL = 'V2-visual-2';

export default function App() {
  const [tab, setTab] = useState<AppTab>('ritmo');
  const [mode, setMode] = useState<InputMode>('pace');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [paceSec, setPaceSec] = useState(330);
  const [speedKmh, setSpeedKmh] = useState(11);
  const [goalDistance, setGoalDistance] = useState(5);
  const [goalTimeSec, setGoalTimeSec] = useState(1620);
  const [cadenceOverride, setCadenceOverride] = useState<number | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(TRACKS[6].id);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [remoteSongs, setRemoteSongs] = useState<RemoteSong[]>([]);
  const [remoteBands, setRemoteBands] = useState<RemotePlaylistBand[]>([]);
  const [isFetchingSongs, setIsFetchingSongs] = useState(false);
  const [songsError, setSongsError] = useState<string | null>(null);
  const [trainings, setTrainings] = useState<TrainingPlan[]>([]);
  const [isFetchingTrainings, setIsFetchingTrainings] = useState(false);
  const [trainingsError, setTrainingsError] = useState<string | null>(null);
  const [selectedTrainingId, setSelectedTrainingId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [embeddedPlayerUrl, setEmbeddedPlayerUrl] = useState<string | null>(null);
  const [embeddedPlayerTitle, setEmbeddedPlayerTitle] = useState<string>('RunBeat Player');
  const [trainingSheetOpen, setTrainingSheetOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as Partial<AppSettings>;
        setSettings((current) => ({
          ...current,
          ...parsed,
          backendUrl: DEFAULT_SETTINGS.backendUrl,
        }));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => undefined);
  }, [settings]);

  const effectivePace = useMemo(() => {
    if (mode === 'pace') return paceSec;
    if (mode === 'speed') return speedToPace(speedKmh);
    return goalTimeSec / goalDistance;
  }, [goalDistance, goalTimeSec, mode, paceSec, speedKmh]);

  const effectiveSpeed = useMemo(() => paceToSpeed(effectivePace), [effectivePace]);
  const suggestedStride = useMemo(() => estimateStrideFromHeight(settings.heightCm), [settings.heightCm]);
  const runnerStride = useMemo(() => effectiveStride(settings), [settings]);
  const autoCadence = useMemo(() => cadenceFromPace(effectivePace, runnerStride), [effectivePace, runnerStride]);
  const selectedTraining = useMemo(
    () => trainings.find((training) => training.id === selectedTrainingId) ?? null,
    [selectedTrainingId, trainings]
  );
  const activeTrainingSegment = useMemo(() => {
    if (!selectedTraining) return null;
    const elapsedMinutes = elapsed / 60;
    return (
      selectedTraining.segments.find(
        (segment) => elapsedMinutes >= segment.minuteStart && elapsedMinutes < segment.minuteEnd
      ) ?? selectedTraining.segments[selectedTraining.segments.length - 1] ?? null
    );
  }, [elapsed, selectedTraining]);
  const trainingCadence = selectedTraining
    ? activeTrainingSegment?.targetCadence ?? selectedTraining.segments[0]?.targetCadence ?? null
    : null;
  const cadence = cadenceOverride ?? trainingCadence ?? autoCadence;
  const liveStride = useMemo(() => strideFor(effectiveSpeed, cadence), [cadence, effectiveSpeed]);
  const backendUrl = useMemo(() => normalizeBackendUrl(settings.backendUrl), [settings.backendUrl]);

  const rankedTracks = useMemo(() => getAllTracksSorted(TRACKS, cadence), [cadence]);
  const presetSongs = useMemo(() => buildPresetSongs(TRACKS), []);
  const bandSongs = useMemo(
    () => remoteBands.flatMap((band) => band.items),
    [remoteBands]
  );
  const allRemoteSongs = useMemo(() => {
    const deduped = new Map<string, RemoteSong>();
    [...remoteSongs, ...bandSongs].forEach((song) => {
      deduped.set(song.id, song);
    });
    return [...deduped.values()];
  }, [bandSongs, remoteSongs]);
  const suggestedTracks = useMemo(
    () => getSuggestedTracks(TRACKS, cadence, settings.tolerance),
    [cadence, settings.tolerance]
  );
  const selectedTrack = useMemo(
    () => rankedTracks.find((entry) => entry.track.id === selectedTrackId)?.track ?? rankedTracks[0]?.track ?? null,
    [rankedTracks, selectedTrackId]
  );
  const selectedPresetSong = useMemo(
    () =>
      presetSongs.find((song) => song.id === `preset-${selectedTrackId}`) ??
      presetSongs.find((song) => song.bpmHint === cadence) ??
      presetSongs[0] ??
      null,
    [cadence, presetSongs, selectedTrackId]
  );
  const selectedSong = useMemo(
    () => allRemoteSongs.find((song) => song.id === selectedSongId) ?? allRemoteSongs[0] ?? selectedPresetSong,
    [allRemoteSongs, selectedPresetSong, selectedSongId]
  );
  const usingRemoteMusic = !!selectedSong;

  useEffect(() => {
    if (!selectedTrack && rankedTracks[0]) {
      setSelectedTrackId(rankedTracks[0].track.id);
    }
  }, [rankedTracks, selectedTrack]);

  useEffect(() => {
    if (allRemoteSongs.length === 0) {
      setSelectedSongId(null);
      return;
    }

    if (!selectedSongId || !allRemoteSongs.some((song) => song.id === selectedSongId)) {
      setSelectedSongId(allRemoteSongs[0].id);
    }
  }, [allRemoteSongs, selectedSongId]);

  useEffect(() => {
    if (!running) return;

    const id = setInterval(() => {
      setElapsed((current) => current + 1);
      setDistanceKm((current) => current + effectiveSpeed / 3600);
    }, 1000);

    return () => clearInterval(id);
  }, [effectiveSpeed, running]);

  async function fetchSongsForCadence() {
    if (!backendUrl) {
      setSongsError('Defina a URL do backend nas configuracoes.');
      setRemoteSongs([]);
      setRemoteBands([]);
      return;
    }

    setIsFetchingSongs(true);
    setSongsError(null);

    try {
      const [catalogResponse, playlistResponse, searchResponse] = await Promise.all([
        fetch(
          `${backendUrl}/catalog?bpm=${encodeURIComponent(cadence)}&limit=12&tolerance=${encodeURIComponent(
            Math.max(settings.tolerance, 8)
          )}${selectedGenre !== 'all' ? `&genre=${encodeURIComponent(selectedGenre)}` : ''}`
        ),
        fetch(
          `${backendUrl}/playlist?bpm=${encodeURIComponent(cadence)}&limit_per_band=4&tolerance=${encodeURIComponent(
            Math.max(settings.tolerance, 8)
          )}${selectedGenre !== 'all' ? `&genre=${encodeURIComponent(selectedGenre)}` : ''}`
        ),
        fetch(
          `${backendUrl}/search?bpm=${encodeURIComponent(cadence)}&limit=8&tolerance=${encodeURIComponent(
            Math.max(settings.tolerance, 8)
          )}${selectedGenre !== 'all' ? `&genre=${encodeURIComponent(selectedGenre)}` : ''}`
        ),
      ]);

      const canUseCatalog = catalogResponse.ok;
      if (!canUseCatalog && catalogResponse.status !== 404) {
        throw new Error(`Catalogo respondeu ${catalogResponse.status}`);
      }

      if (!playlistResponse.ok) {
        throw new Error(`Playlist respondeu ${playlistResponse.status}`);
      }

      if (!searchResponse.ok) {
        throw new Error(`Busca respondeu ${searchResponse.status}`);
      }

      const catalogData = canUseCatalog ? ((await catalogResponse.json()) as { items?: RemoteSong[] }) : { items: [] };
      const playlistData = (await playlistResponse.json()) as { bands?: RemotePlaylistBand[] };
      const searchData = (await searchResponse.json()) as { items?: RemoteSong[] };
      const catalogItems = Array.isArray(catalogData.items) ? catalogData.items : [];
      const searchItems = Array.isArray(searchData.items) ? searchData.items : [];
      const bands = Array.isArray(playlistData.bands) ? playlistData.bands : [];
      const deduped = new Map<string, RemoteSong>();
      [...catalogItems, ...searchItems].forEach((song) => {
        deduped.set(song.id, song);
      });
      const items = [...deduped.values()];

      setRemoteSongs(items);
      setRemoteBands(bands);

      if (items.length === 0) {
        setSongsError('O backend respondeu, mas ainda nao encontrou musicas para esse BPM.');
      } else if (!canUseCatalog) {
        setSongsError('Catalogo ainda nao disponivel nesta build do backend. Usando busca complementar.');
      }
    } catch (error) {
      setRemoteSongs([]);
      setRemoteBands([]);
      setSongsError(error instanceof Error ? error.message : 'Falha ao buscar musicas reais.');
    } finally {
      setIsFetchingSongs(false);
    }
  }

  async function fetchTrainings() {
    if (!backendUrl) {
      setTrainingsError('Backend indisponivel para carregar os treinos.');
      setTrainings([]);
      return;
    }

    setIsFetchingTrainings(true);
    setTrainingsError(null);

    try {
      const response = await fetch(`${backendUrl}/trainings`);
      if (!response.ok) {
        throw new Error(`Treinos responderam ${response.status}`);
      }

      const data = (await response.json()) as { items?: TrainingPlan[] };
      const items = Array.isArray(data.items) ? data.items : [];
      setTrainings(items);

      if (items.length > 0 && !selectedTrainingId) {
        setSelectedTrainingId(items[0].id);
      }
    } catch (error) {
      setTrainings([]);
      setTrainingsError(error instanceof Error ? error.message : 'Falha ao buscar treinos.');
    } finally {
      setIsFetchingTrainings(false);
    }
  }

  useEffect(() => {
    if (!backendUrl) return;
    const timer = setTimeout(() => {
      void fetchSongsForCadence();
    }, 450);

    return () => clearTimeout(timer);
  }, [backendUrl, cadence, selectedGenre, settings.tolerance]);

  useEffect(() => {
    if (!backendUrl) return;
    void fetchTrainings();
  }, [backendUrl]);

  useRunBeatAudio({
    cadence,
    metronomeSound: settings.metronomeSound,
    metronomeVolume: settings.metronomeVolume,
    musicVolume: settings.autoDuck ? Math.min(settings.musicVolume, settings.metronomeVolume * 0.8) : settings.musicVolume,
    musicTrack: usingRemoteMusic ? null : selectedTrack,
    shouldPlayMetronome: running,
    shouldPlayMusic: running && musicEnabled && !usingRemoteMusic && !!selectedTrack,
  });

  const updateSettings = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const resetStride = () => {
    updateSettings('strideMeters', Number(suggestedStride.toFixed(2)));
  };

  const startRun = () => {
    setStarted(true);
    setRunning(true);
    setTab('correr');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  };

  const startTraining = (trainingId: string) => {
    setSelectedTrainingId(trainingId);
    setElapsed(0);
    setDistanceKm(0);
    setStarted(true);
    setRunning(true);
    setTab('correr');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  };

  const stopRun = () => {
    setRunning(false);
    setStarted(false);
    setElapsed(0);
    setDistanceKm(0);
  };

  const nextTrack = () => {
    if (remoteSongs.length > 0) {
      const index = remoteSongs.findIndex((song) => song.id === selectedSong?.id);
      const next = remoteSongs[(index + 1 + remoteSongs.length) % remoteSongs.length];
      setSelectedSongId(next.id);
      return;
    }

    const list = suggestedTracks.length > 0 ? suggestedTracks : rankedTracks;
    if (list.length === 0) return;
    const index = list.findIndex((entry) => entry.track.id === selectedTrackId);
    const next = list[(index + 1 + list.length) % list.length];
    setSelectedTrackId(next.track.id);
  };

  async function openRemoteSong(song: RemoteSong | null) {
    if (!song) return;
    const preferredUrl = song.musicUrl;
    const supported = await Linking.canOpenURL(preferredUrl);
    await Linking.openURL(supported ? preferredUrl : song.youtubeUrl);
  }

  function openEmbeddedPlayer(song: RemoteSong | null) {
    if (!song) return;
    const preferredUrl = song.youtubeUrl || song.musicUrl;
    setEmbeddedPlayerTitle(song.title);
    setEmbeddedPlayerUrl(preferredUrl);
  }

  async function openYouTubeMusicSearch() {
    const url = makeYouTubeMusicSearchUrl(makeCadenceQueries(cadence)[0]);
    await Linking.openURL(url);
  }

  const currentFoot = Math.floor(elapsed * (cadence / 60)) % 2 === 0 ? 'Esquerda' : 'Direita';
  const currentScreen = (() => {
    switch (tab) {
      case 'correr':
        return (
          <RunScreenV2
            cadence={cadence}
            distanceKm={distanceKm}
            elapsed={elapsed}
            pace={effectivePace}
            running={running}
            started={started}
            currentFoot={currentFoot}
            selectedTraining={selectedTraining}
            activeTrainingSegment={activeTrainingSegment}
            onStart={startRun}
            onOpenTrainings={() => setTab('treinos')}
            onPause={() => setRunning(false)}
            onResume={() => setRunning(true)}
            onStop={stopRun}
            musicEnabled={musicEnabled}
            onToggleMusic={() => setMusicEnabled((current) => !current)}
            selectedTrack={remoteSongs.length > 0 ? null : selectedTrack}
            selectedSong={selectedSong}
            nextTrack={nextTrack}
            onOpenRemoteSong={() => void openRemoteSong(selectedSong)}
            onOpenEmbeddedSong={() => openEmbeddedPlayer(selectedSong)}
            onOpenMusicSearch={() => void openYouTubeMusicSearch()}
            metronomeVolume={settings.metronomeVolume}
            musicVolume={settings.musicVolume}
            onChangeMetronomeVolume={(value) => updateSettings('metronomeVolume', value)}
            onChangeMusicVolume={(value) => updateSettings('musicVolume', value)}
          />
        );
      case 'musicas':
        return (
          <TracksScreen
            cadence={cadence}
            tolerance={settings.tolerance}
            backendUrl={backendUrl}
            selectedGenre={selectedGenre}
            onChangeGenre={setSelectedGenre}
            isFetchingSongs={isFetchingSongs}
            songsError={songsError}
            remoteSongs={remoteSongs}
            presetSongs={presetSongs}
            remoteBands={remoteBands}
            selectedSongId={selectedSong?.id ?? null}
            onRefresh={() => void fetchSongsForCadence()}
            onSelectSong={setSelectedSongId}
            onOpenSong={(song) => void openRemoteSong(song)}
            onPlayInside={(song) => openEmbeddedPlayer(song)}
            onOpenSearch={() => void openYouTubeMusicSearch()}
            onChangeTolerance={(value) => updateSettings('tolerance', value)}
            tracks={rankedTracks}
            selectedTrackId={selectedTrackId}
            onSelectTrack={setSelectedTrackId}
          />
        );
      case 'treinos':
        return (
          <TrainingsScreenV2
            trainings={trainings}
            selectedTrainingId={selectedTrainingId}
            isFetchingTrainings={isFetchingTrainings}
            trainingsError={trainingsError}
            currentCadence={cadence}
            currentSegment={activeTrainingSegment}
            onRefresh={() => void fetchTrainings()}
            onSelectTraining={setSelectedTrainingId}
            onStartTraining={startTraining}
            onOpenDetails={(value) => {
              setSelectedTrainingId(value);
              setTrainingSheetOpen(true);
            }}
          />
        );
      case 'mixer':
        return (
          <SettingsScreen
            settings={settings}
            suggestedStride={suggestedStride}
            onChangeSettings={updateSettings}
            onResetStride={resetStride}
          />
        );
      default:
        return (
          <RhythmScreen
            mode={mode}
            onModeChange={setMode}
            paceSec={paceSec}
            onChangePace={setPaceSec}
            speedKmh={speedKmh}
            onChangeSpeed={setSpeedKmh}
            goalDistance={goalDistance}
            onChangeGoalDistance={setGoalDistance}
            goalTimeSec={goalTimeSec}
            onChangeGoalTime={setGoalTimeSec}
            cadence={cadence}
            autoCadence={autoCadence}
            trainingCadence={trainingCadence}
            selectedTraining={selectedTraining}
            onChangeCadence={(value) => setCadenceOverride(value)}
            onResetCadence={() => setCadenceOverride(null)}
            pace={effectivePace}
            speed={effectiveSpeed}
            stride={liveStride}
            selectedTrack={remoteSongs.length > 0 ? null : selectedTrack}
            selectedSong={selectedSong}
            onStartRun={startRun}
            onOpenRemoteSong={() => void openRemoteSong(selectedSong)}
            onOpenEmbeddedSong={() => openEmbeddedPlayer(selectedSong)}
          />
        );
    }
  })();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <LinearGradient colors={['#1B1E23', '#0B0F13']} style={StyleSheet.absoluteFill} />
      <View style={styles.appShell}>
        <ScrollView contentContainerStyle={styles.content}>{currentScreen}</ScrollView>
        <View style={styles.tabBar}>
          <TabButton label="Ritmo" tab="ritmo" current={tab} icon="speedometer-outline" onPress={setTab} />
          <TabButton label="Treinos" tab="treinos" current={tab} icon="fitness-outline" onPress={setTab} />
          <TabButton label="Correr" tab="correr" current={tab} icon="pulse-outline" onPress={setTab} />
          <TabButton label="Musicas" tab="musicas" current={tab} icon="musical-notes-outline" onPress={setTab} />
          <TabButton label="Mixer" tab="mixer" current={tab} icon="options-outline" onPress={setTab} />
        </View>
      </View>
      <Modal visible={!!embeddedPlayerUrl} animationType="slide" onRequestClose={() => setEmbeddedPlayerUrl(null)}>
        <SafeAreaView style={styles.playerSafeArea}>
          <LinearGradient colors={['#1B1E23', '#0B0F13']} style={StyleSheet.absoluteFill} />
          <View style={styles.playerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Player interno</Text>
              <Text style={styles.playerTitle}>{embeddedPlayerTitle}</Text>
            </View>
            <Pressable onPress={() => setEmbeddedPlayerUrl(null)} style={styles.playerCloseButton}>
              <Ionicons name="close" size={22} color="#F4F7FB" />
            </Pressable>
          </View>
          {embeddedPlayerUrl ? <WebView source={{ uri: embeddedPlayerUrl }} style={styles.playerWebView} /> : null}
        </SafeAreaView>
      </Modal>
      <Modal visible={trainingSheetOpen} animationType="slide" transparent onRequestClose={() => setTrainingSheetOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTrainingSheetOpen(false)} />
          <View style={styles.sheet}>
            {selectedTraining ? (
              <TrainingDetailSheetV2
                training={selectedTraining}
                songPool={allRemoteSongs.length > 0 ? allRemoteSongs : presetSongs}
                onPlaySong={(song) => openEmbeddedPlayer(song)}
                onOpenSong={(song) => void openRemoteSong(song)}
                onClose={() => setTrainingSheetOpen(false)}
                onStart={() => {
                  setTrainingSheetOpen(false);
                  startTraining(selectedTraining.id);
                }}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TabButton({
  label,
  tab,
  current,
  icon,
  onPress,
}: {
  label: string;
  tab: AppTab;
  current: AppTab;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: (tab: AppTab) => void;
}) {
  const active = current === tab;
  return (
    <Pressable onPress={() => onPress(tab)} style={styles.tabButton}>
      <Ionicons name={icon} size={22} color={active ? '#C3FF3B' : '#737B84'} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function RhythmScreen(props: {
  mode: InputMode;
  onModeChange: (value: InputMode) => void;
  paceSec: number;
  onChangePace: (value: number) => void;
  speedKmh: number;
  onChangeSpeed: (value: number) => void;
  goalDistance: number;
  onChangeGoalDistance: (value: number) => void;
  goalTimeSec: number;
  onChangeGoalTime: (value: number) => void;
  cadence: number;
  autoCadence: number;
  trainingCadence: number | null;
  selectedTraining: TrainingPlan | null;
  onChangeCadence: (value: number) => void;
  onResetCadence: () => void;
  pace: number;
  speed: number;
  stride: number;
  selectedTrack: Track | null;
  selectedSong: RemoteSong | null;
  onStartRun: () => void;
  onOpenRemoteSong: () => void;
  onOpenEmbeddedSong: () => void;
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>RunBeat</Text>
      <Text style={styles.buildBadge}>{VISUAL_BUILD_LABEL}</Text>
      <Text style={styles.title}>Defina seu ritmo</Text>
      <Text style={styles.subtitle}>Pace alvo vira BPM de passada automaticamente.</Text>

      <Segmented value={props.mode} onChange={props.onModeChange} />

      <Card>
        {props.mode === 'pace' ? (
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.cardLabel}>Pace alvo</Text>
              <Text style={styles.metricValue}>
                {formatPace(props.paceSec)}
                <Text style={styles.metricUnit}> /km</Text>
              </Text>
              <Text style={styles.metricHint}>~ {props.speed.toFixed(1)} km/h</Text>
            </View>
            <Stepper
              onDec={() => props.onChangePace(clamp(props.paceSec + 5, 180, 540))}
              onInc={() => props.onChangePace(clamp(props.paceSec - 5, 180, 540))}
            />
          </View>
        ) : null}

        {props.mode === 'speed' ? (
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.cardLabel}>Velocidade alvo</Text>
              <Text style={styles.metricValue}>
                {props.speedKmh.toFixed(1)}
                <Text style={styles.metricUnit}> km/h</Text>
              </Text>
              <Text style={styles.metricHint}>~ {formatPace(props.pace)} /km</Text>
            </View>
            <Stepper
              onDec={() => props.onChangeSpeed(clamp(Number((props.speedKmh - 0.1).toFixed(1)), 6, 20))}
              onInc={() => props.onChangeSpeed(clamp(Number((props.speedKmh + 0.1).toFixed(1)), 6, 20))}
            />
          </View>
        ) : null}

        {props.mode === 'goal' ? (
          <View style={styles.goalBlock}>
            <View style={styles.row}>
              {[5, 10, 21.1].map((distance) => (
                <PillButton
                  key={distance}
                  active={distance === props.goalDistance}
                  label={distance === 21.1 ? '21K' : `${distance}K`}
                  onPress={() => props.onChangeGoalDistance(distance)}
                />
              ))}
            </View>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardLabel}>Tempo objetivo</Text>
                <Text style={styles.metricValue}>{formatClock(props.goalTimeSec)}</Text>
                <Text style={styles.metricHint}>
                  pace {formatPace(props.pace)} /km · {props.speed.toFixed(1)} km/h
                </Text>
              </View>
              <Stepper
                onDec={() => props.onChangeGoalTime(clamp(props.goalTimeSec - 30, 300, 21600))}
                onInc={() => props.onChangeGoalTime(clamp(props.goalTimeSec + 30, 300, 21600))}
              />
            </View>
          </View>
        ) : null}
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.cardLabel}>Cadencia gerada</Text>
            <Text style={styles.smallHint}>cada clique = uma passada</Text>
          </View>
          <View>
            <Text style={[styles.metricValue, { color: '#C3FF3B', textAlign: 'right' }]}>
              {props.cadence}
              <Text style={styles.metricUnit}> BPM</Text>
            </Text>
            <Text style={styles.metricHint}>
              {props.selectedTraining && props.trainingCadence
                ? `${props.selectedTraining.name} · alvo ${props.trainingCadence} BPM`
                : `auto ${props.autoCadence} BPM`}
            </Text>
          </View>
        </View>
        <Gauge cadence={props.cadence} onChange={props.onChangeCadence} />
        <Text style={styles.metricHint}>
          Faixa total {MIN_CADENCE_BPM}-{MAX_CADENCE_BPM} BPM · recomendado {RECOMMENDED_MIN_CADENCE_BPM}-{RECOMMENDED_MAX_CADENCE_BPM}
        </Text>
        <View style={styles.rowBetween}>
          <Stat label="Passada" value={`${props.stride.toFixed(2)} m`} />
          <Stat label="Pace" value={`${formatPace(props.pace)} /km`} />
          <Stat label="Status" value={getCadenceStatus(props.cadence)} />
        </View>
        <Pressable onPress={props.onResetCadence} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Voltar para cadencia automatica</Text>
        </Pressable>
      </Card>

      {props.selectedSong ? (
        <Card>
          <Text style={styles.cardLabel}>Musica real sugerida</Text>
          <RemoteSongRow song={props.selectedSong} active />
          <View style={styles.rowBetween}>
            <Pressable onPress={props.onOpenEmbeddedSong} style={styles.secondaryButtonCompact}>
              <Text style={styles.secondaryButtonText}>Tocar aqui</Text>
            </Pressable>
            <Pressable onPress={props.onOpenRemoteSong} style={styles.secondaryButtonCompact}>
              <Text style={styles.secondaryButtonText}>Abrir no YouTube Music</Text>
            </Pressable>
          </View>
        </Card>
      ) : props.selectedTrack ? (
        <Card>
          <Text style={styles.cardLabel}>Fallback local</Text>
          <TrackRow track={props.selectedTrack} distance={0} active />
        </Card>
      ) : null}

      <Pressable onPress={props.onStartRun} style={styles.primaryButton}>
        <Ionicons name="play" size={20} color="#0D1116" />
        <Text style={styles.primaryButtonText}>Iniciar corrida</Text>
      </Pressable>
    </View>
  );
}

function RunScreen(props: {
  cadence: number;
  distanceKm: number;
  elapsed: number;
  pace: number;
  running: boolean;
  started: boolean;
  currentFoot: string;
  selectedTraining: TrainingPlan | null;
  activeTrainingSegment: TrainingPlan['segments'][number] | null;
  onStart: () => void;
  onOpenTrainings: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  musicEnabled: boolean;
  onToggleMusic: () => void;
  selectedTrack: Track | null;
  selectedSong: RemoteSong | null;
  nextTrack: () => void;
  onOpenRemoteSong: () => void;
  onOpenEmbeddedSong: () => void;
  onOpenMusicSearch: () => void;
  metronomeVolume: number;
  musicVolume: number;
  onChangeMetronomeVolume: (value: number) => void;
  onChangeMusicVolume: (value: number) => void;
}) {
  if (!props.started) {
    return (
      <View style={[styles.screen, styles.centeredScreen]}>
        <View style={styles.startRing}>
          <MaterialCommunityIcons name="heart-pulse" size={34} color="#C3FF3B" />
        </View>
        <Text style={styles.title}>Pronto para correr</Text>
        <Text style={styles.subtitle}>
          Cadencia {props.cadence} BPM · pace {formatPace(props.pace)} /km
        </Text>
        {props.selectedTraining ? (
          <Text style={styles.metricHint}>
            Treino ativo: {props.selectedTraining.name} Â· {props.selectedTraining.durationMinutes} min
          </Text>
        ) : null}
        <View style={styles.startActions}>
          <Pressable onPress={props.onStart} style={styles.primaryButton}>
            <Ionicons name="play" size={20} color="#0D1116" />
            <Text style={styles.primaryButtonText}>Corrida livre</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.runHeader}>
        <Stat label="Tempo" value={formatClock(props.elapsed)} emphasis />
        <Stat label="Distancia" value={`${props.distanceKm.toFixed(2)} km`} emphasis />
        <Stat label="Pace" value={`${formatPace(props.pace)} /km`} emphasis />
      </View>

      {props.selectedTraining && props.activeTrainingSegment ? (
        <Card>
          {(() => {
            const training = props.selectedTraining!;
            const segmentIndex = training.segments.findIndex((segment) => segment === props.activeTrainingSegment) + 1;
            return (
              <>
          <View style={styles.rowBetween}>
            <View style={styles.levelBadge}>
              <View style={styles.levelDot} />
              <Text style={styles.levelBadgeText}>{training.level}</Text>
            </View>
            <Text style={styles.metricHint}>
              etapa {segmentIndex}/{training.segments.length}
            </Text>
          </View>
          <Text style={styles.trackTitle}>{training.name}</Text>
          <View style={styles.rowBetween}>
            <Stat
              label="Segmento"
              value={`${props.activeTrainingSegment.minuteStart}-${props.activeTrainingSegment.minuteEnd} min`}
            />
            <Stat label="Alvo" value={`${props.activeTrainingSegment.targetCadence} BPM`} />
          </View>
          <View style={styles.trainingRangeBar}>
            {training.segments.map((segment, index) => (
              <View
                key={`${training.id}-live-${index}`}
                style={[
                  styles.trainingRangeStep,
                  {
                    flex: Math.max(1, segment.minuteEnd - segment.minuteStart),
                    opacity: segment === props.activeTrainingSegment ? 1 : 0.35,
                  },
                ]}
              />
            ))}
          </View>
              </>
            );
          })()}
        </Card>
      ) : null}

      <View style={styles.beatShell}>
        <View style={[styles.beatCore, props.running && styles.beatCoreActive]}>
          <Text style={styles.beatNumber}>{props.cadence}</Text>
          <Text style={styles.beatLabel}>BPM</Text>
          <View style={styles.footBadge}>
            <View style={[styles.footDot, props.running && styles.footDotActive]} />
            <Text style={styles.footText}>{props.running ? `Pisada ${props.currentFoot.toLowerCase()}` : 'Pausado'}</Text>
          </View>
        </View>
      </View>

      {props.selectedSong ? (
        <Card>
          <Text style={styles.cardLabel}>Agora no YouTube Music</Text>
          <RemoteSongRow song={props.selectedSong} active />
          <View style={styles.rowBetween}>
            <Pressable onPress={props.onToggleMusic} style={styles.compactButton}>
              <Ionicons name={props.musicEnabled ? 'pause' : 'play'} size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>{props.musicEnabled ? 'Som local off' : 'Som local on'}</Text>
            </Pressable>
            <Pressable onPress={props.onOpenEmbeddedSong} style={styles.compactButton}>
              <Ionicons name="play-circle-outline" size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>Tocar aqui</Text>
            </Pressable>
          </View>
          <View style={styles.rowBetween}>
            <Pressable onPress={props.onOpenRemoteSong} style={styles.compactButton}>
              <Ionicons name="open-outline" size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>Abrir musica</Text>
            </Pressable>
            <Pressable onPress={props.nextTrack} style={styles.compactButton}>
              <Ionicons name="play-skip-forward" size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>Proxima sugestao</Text>
            </Pressable>
            <Pressable onPress={props.onOpenMusicSearch} style={styles.compactButton}>
              <Ionicons name="search" size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>Busca aberta</Text>
            </Pressable>
          </View>
        </Card>
      ) : props.selectedTrack ? (
        <Card>
          <TrackRow track={props.selectedTrack} distance={0} active />
          <View style={styles.rowBetween}>
            <Pressable onPress={props.onToggleMusic} style={styles.compactButton}>
              <Ionicons name={props.musicEnabled ? 'pause' : 'play'} size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>{props.musicEnabled ? 'Pausar demo' : 'Tocar demo'}</Text>
            </Pressable>
            <Pressable onPress={props.nextTrack} style={styles.compactButton}>
              <Ionicons name="play-skip-forward" size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>Proxima demo</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.cardLabel}>Mixer da corrida</Text>
        <VolumeRow
          label="Metronomo"
          value={props.metronomeVolume}
          icon="pulse-outline"
          onChange={props.onChangeMetronomeVolume}
        />
        <VolumeRow
          label="Musica"
          value={props.musicVolume}
          icon="musical-notes-outline"
          onChange={props.onChangeMusicVolume}
        />
      </Card>

      <View style={styles.rowBetween}>
        <Pressable onPress={props.running ? props.onPause : props.onResume} style={styles.secondaryControl}>
          <Ionicons name={props.running ? 'pause' : 'play'} size={18} color="#F4F7FB" />
          <Text style={styles.secondaryControlText}>{props.running ? 'Pausar' : 'Continuar'}</Text>
        </Pressable>
        <Pressable onPress={props.onStop} style={styles.stopControl}>
          <Ionicons name="stop" size={18} color="#0D1116" />
          <Text style={styles.stopControlText}>Encerrar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TracksScreen(props: {
  cadence: number;
  tolerance: number;
  backendUrl: string;
  selectedGenre: string;
  onChangeGenre: (value: string) => void;
  isFetchingSongs: boolean;
  songsError: string | null;
  remoteSongs: RemoteSong[];
  presetSongs: RemoteSong[];
  remoteBands: RemotePlaylistBand[];
  selectedSongId: string | null;
  onRefresh: () => void;
  onSelectSong: (value: string) => void;
  onOpenSong: (song: RemoteSong) => void;
  onPlayInside: (song: RemoteSong) => void;
  onOpenSearch: () => void;
  onChangeTolerance: (value: number) => void;
  tracks: Array<{ track: Track; distance: number }>;
  selectedTrackId: string;
  onSelectTrack: (value: string) => void;
}) {
  const allSongs = [...props.remoteSongs, ...props.remoteBands.flatMap((band) => band.items)];
  const [showAll, setShowAll] = useState(false);
  const genreOptions = ['all', 'pop', 'rock', 'hip hop', 'electronic', 'metal'];
  const visibleSongs = showAll
    ? props.remoteSongs
    : props.remoteSongs.filter((song) => Math.abs((song.cadenceTarget ?? song.effectiveBpm ?? song.bpmHint) - props.cadence) <= props.tolerance);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Musicas</Text>
      <Text style={styles.buildBadge}>{VISUAL_BUILD_LABEL}</Text>
      <Text style={styles.subtitle}>Catalogo curado por BPM com apoio do YouTube Music e player dentro do RunBeat.</Text>

      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.cardLabel}>Cadencia alvo</Text>
          <Text style={[styles.metricValue, { color: '#C3FF3B' }]}>{props.cadence} BPM</Text>
        </View>
        <Text style={styles.metricHint}>Backend: {props.backendUrl || 'nao configurado'}</Text>
        <View style={styles.row}>
          {[2, 4, 6].map((value) => (
            <PillButton
              key={value}
              active={value === props.tolerance}
              label={`±${value}`}
              onPress={() => props.onChangeTolerance(value)}
            />
          ))}
        </View>
        <View style={styles.row}>
          {genreOptions.map((genre) => (
            <PillButton
              key={genre}
              active={props.selectedGenre === genre}
              label={genre === 'all' ? 'todos' : genre}
              onPress={() => props.onChangeGenre(genre)}
            />
          ))}
        </View>
        <View style={styles.rowBetween}>
          <Pressable onPress={props.onRefresh} style={styles.secondaryButtonCompact}>
            <Text style={styles.secondaryButtonText}>Atualizar resultados</Text>
          </Pressable>
          <Pressable onPress={props.onOpenSearch} style={styles.secondaryButtonCompact}>
            <Text style={styles.secondaryButtonText}>Abrir busca direta</Text>
          </Pressable>
        </View>
      </Card>

      <View style={styles.rowBetween}>
        <Text style={styles.listHeading}>{showAll ? 'TODAS AS FAIXAS' : `NO SEU RITMO · ${visibleSongs.length}`}</Text>
        <Pressable onPress={() => setShowAll((current) => !current)}>
          <Text style={styles.linkAccent}>{showAll ? 'So no ritmo' : 'Ver todas'}</Text>
        </Pressable>
      </View>

      <Card>
        <Text style={styles.cardLabel}>Catalogo principal</Text>
        {props.isFetchingSongs ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#C3FF3B" />
            <Text style={styles.metricHint}>Buscando musicas do catalogo e da web...</Text>
          </View>
        ) : null}
        {props.songsError ? <Text style={styles.errorText}>{props.songsError}</Text> : null}
        {visibleSongs.map((song) => (
          <Pressable
            key={song.id}
            onPress={() => props.onSelectSong(song.id)}
            onLongPress={() => props.onPlayInside(song)}
          >
            <RemoteSongRow song={song} active={song.id === props.selectedSongId} />
          </Pressable>
        ))}
        {!props.isFetchingSongs && visibleSongs.length === 0 ? (
          <Text style={styles.emptyText}>Sem resultados do catalogo agora. O app continua com sugestoes pre-configuradas como fallback.</Text>
        ) : null}
        {props.selectedSongId ? (
          <View style={styles.rowBetween}>
            <Pressable
              onPress={() => {
                const selected = allSongs.find((song) => song.id === props.selectedSongId);
                if (selected) props.onPlayInside(selected);
              }}
              style={styles.secondaryButtonCompact}
            >
              <Text style={styles.secondaryButtonText}>Tocar aqui</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const selected = allSongs.find((song) => song.id === props.selectedSongId);
                if (selected) props.onOpenSong(selected);
              }}
              style={styles.secondaryButtonCompact}
            >
              <Text style={styles.secondaryButtonText}>Abrir externo</Text>
            </Pressable>
          </View>
        ) : null}
      </Card>

      {props.remoteBands.length > 0 ? (
        <Card>
          <Text style={styles.cardLabel}>Playlists por faixa de BPM</Text>
          <Text style={styles.metricHint}>Grupos prontos para aquecer, sustentar, bater o alvo e acelerar.</Text>
          {props.remoteBands.map((band) => (
            <View key={band.id} style={styles.bandBlock}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bandTitle}>{band.label}</Text>
                  <Text style={styles.bandHint}>{band.description}</Text>
                </View>
                <Text style={styles.bandBpm}>{band.bpm} BPM</Text>
              </View>
              {band.items.map((song) => (
                <Pressable
                  key={`${band.id}-${song.id}`}
                  onPress={() => props.onSelectSong(song.id)}
                  onLongPress={() => props.onPlayInside(song)}
                >
                  <RemoteSongRow song={song} active={song.id === props.selectedSongId} />
                </Pressable>
              ))}
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.cardLabel}>Sugestoes pre-configuradas</Text>
        <Text style={styles.metricHint}>Se o backend falhar, estas sugestoes ja abrem buscas reais no YouTube Music por faixa e BPM.</Text>
        {props.presetSongs
          .filter((song) => Math.abs(song.bpmHint - props.cadence) <= props.tolerance || song.id === `preset-${props.selectedTrackId}`)
          .map((song) => (
            <Pressable key={song.id} onPress={() => props.onSelectSong(song.id)} onLongPress={() => props.onPlayInside(song)}>
              <RemoteSongRow song={song} active={song.id === props.selectedSongId} />
            </Pressable>
          ))}
      </Card>
    </View>
  );
}

function TrainingsScreen(props: {
  trainings: TrainingPlan[];
  selectedTrainingId: string | null;
  isFetchingTrainings: boolean;
  trainingsError: string | null;
  currentCadence: number;
  currentSegment: TrainingPlan['segments'][number] | null;
  onRefresh: () => void;
  onSelectTraining: (value: string) => void;
  onStartTraining: (value: string) => void;
  onOpenDetails: (value: string) => void;
}) {
  const selectedTraining = props.trainings.find((training) => training.id === props.selectedTrainingId) ?? null;
  const selectedRange = selectedTraining
    ? {
        min: Math.min(...selectedTraining.segments.map((segment) => segment.targetCadence)),
        max: Math.max(...selectedTraining.segments.map((segment) => segment.targetCadence)),
      }
    : null;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Treinos</Text>
      <Text style={styles.buildBadge}>{VISUAL_BUILD_LABEL}</Text>
      <Text style={styles.subtitle}>Programas progressivos: a cadencia sobe em etapas e a musica acompanha o seu ritmo.</Text>

      <Card>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.cardLabel}>Cadencia atual</Text>
            <Text style={[styles.metricValue, { color: '#C3FF3B' }]}>{props.currentCadence} BPM</Text>
          </View>
          <Pressable onPress={props.onRefresh} style={styles.secondaryButtonCompact}>
            <Text style={styles.secondaryButtonText}>Atualizar treinos</Text>
          </Pressable>
        </View>
        {props.currentSegment ? (
          <Text style={styles.metricHint}>
            Segmento ativo: {props.currentSegment.minuteStart}-{props.currentSegment.minuteEnd} min · alvo{' '}
            {props.currentSegment.targetCadence} BPM
          </Text>
        ) : (
          <Text style={styles.metricHint}>Selecione um treino para guiar a corrida por cadencia.</Text>
        )}
      </Card>

      <Card>
        <Text style={styles.cardLabel}>Planos disponiveis</Text>
        {props.isFetchingTrainings ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#C3FF3B" />
            <Text style={styles.metricHint}>Carregando treinos...</Text>
          </View>
        ) : null}
        {props.trainingsError ? <Text style={styles.errorText}>{props.trainingsError}</Text> : null}
        {props.trainings.map((training) => (
          <Pressable
            key={training.id}
            onPress={() => {
              props.onSelectTraining(training.id);
              props.onOpenDetails(training.id);
            }}
            style={[styles.trainingCard, props.selectedTrainingId === training.id && styles.trainingCardActive]}
          >
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.trackTitle}>{training.name}</Text>
                <Text style={styles.trackArtist}>
                  {training.level} · {training.durationMinutes} min · {training.segments.length} segmentos
                </Text>
              </View>
              <Text style={styles.bandBpm}>{training.segments[0]?.targetCadence ?? '--'} BPM</Text>
            </View>
            <View style={styles.trainingRangeBar}>
              {training.segments.map((segment, index) => (
                <View
                  key={`${training.id}-bar-${index}`}
                  style={[styles.trainingRangeStep, { flex: Math.max(1, segment.minuteEnd - segment.minuteStart) }]}
                />
              ))}
            </View>
            <View style={styles.trainingSegments}>
              {training.segments.map((segment, index) => (
                <View key={`${training.id}-${index}`} style={styles.trainingSegmentPill}>
                  <Text style={styles.trainingSegmentText}>
                    {segment.minuteStart}-{segment.minuteEnd} · {segment.targetCadence}
                  </Text>
                </View>
              ))}
            </View>
          </Pressable>
        ))}
        {!props.isFetchingTrainings && props.trainings.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum treino progressivo encontrado no backend.</Text>
        ) : null}
      </Card>

      {selectedTraining && selectedRange ? (
        <Card>
          <Text style={styles.cardLabel}>{selectedTraining.name}</Text>
          <Text style={styles.metricHint}>
            {selectedTraining.tagline ??
              'Treino progressivo para subir a cadencia com consistencia e controle durante a corrida.'}
          </Text>
          <View style={styles.rowBetween}>
            <Stat label="Duracao" value={`${selectedTraining.durationMinutes} min`} />
            <Stat label="Cadencia" value={`${selectedRange.min}-${selectedRange.max}`} />
            <Stat label="Etapas" value={`${selectedTraining.segments.length}`} />
          </View>
          {selectedTraining.goals && selectedTraining.goals.length > 0 ? (
            <View style={styles.trainingGoals}>
              {selectedTraining.goals.map((goal) => (
                <View key={goal} style={styles.trainingGoalRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#C3FF3B" />
                  <Text style={styles.trainingGoalText}>{goal}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable onPress={() => props.onStartTraining(selectedTraining.id)} style={styles.primaryButton}>
            <Ionicons name="play" size={20} color="#0D1116" />
            <Text style={styles.primaryButtonText}>Iniciar treino</Text>
          </Pressable>
        </Card>
      ) : null}
    </View>
  );
}

function TrainingDetailSheet(props: {
  training: TrainingPlan;
  onClose: () => void;
  onStart: () => void;
}) {
  const range = {
    min: Math.min(...props.training.segments.map((segment) => segment.targetCadence)),
    max: Math.max(...props.training.segments.map((segment) => segment.targetCadence)),
  };

  return (
    <View style={styles.sheetContent}>
      <View style={styles.sheetHandle} />
      <View style={styles.rowBetween}>
        <View style={styles.levelBadge}>
          <View style={styles.levelDot} />
          <Text style={styles.levelBadgeText}>{props.training.level}</Text>
        </View>
        <Pressable onPress={props.onClose} style={styles.playerCloseButton}>
          <Ionicons name="close" size={20} color="#F4F7FB" />
        </Pressable>
      </View>
      <Text style={styles.sheetTitle}>{props.training.name}</Text>
      <Text style={styles.subtitle}>
        {props.training.tagline ?? 'Treino progressivo para subir a cadencia em etapas com controle.'}
      </Text>

      <Card>
        <View style={styles.rowBetween}>
          <Stat label="Duracao" value={`${props.training.durationMinutes} min`} />
          <Stat label="Cadencia" value={`${range.min}-${range.max}`} />
          <Stat label="Etapas" value={`${props.training.segments.length}`} />
        </View>
      </Card>

      {props.training.goals && props.training.goals.length > 0 ? (
        <Card>
          <Text style={styles.cardLabel}>Objetivos</Text>
          <View style={styles.trainingGoals}>
            {props.training.goals.map((goal) => (
              <View key={goal} style={styles.trainingGoalRow}>
                <Ionicons name="checkmark-circle" size={16} color="#C3FF3B" />
                <Text style={styles.trainingGoalText}>{goal}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.cardLabel}>Progressao por etapa</Text>
        <View style={styles.trainingSegmentsColumn}>
          {props.training.segments.map((segment, index) => (
            <View key={`${props.training.id}-detail-${index}`} style={styles.trainingSegmentDetailRow}>
              <Text style={styles.trainingSegmentTime}>
                {segment.minuteStart}-{segment.minuteEnd} min
              </Text>
              <View style={styles.trainingSegmentDetailTrack}>
                <View
                  style={[
                    styles.trainingSegmentDetailFill,
                    { width: `${((segment.targetCadence - 135) / (195 - 135)) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.trainingSegmentCadence}>{segment.targetCadence}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Pressable onPress={props.onStart} style={styles.primaryButton}>
        <Ionicons name="play" size={20} color="#0D1116" />
        <Text style={styles.primaryButtonText}>Iniciar treino</Text>
      </Pressable>
    </View>
  );
}

function getTrainingRange(training: TrainingPlan) {
  return {
    min: Math.min(...training.segments.map((segment) => segment.targetCadence)),
    max: Math.max(...training.segments.map((segment) => segment.targetCadence)),
  };
}

function getTrainingAccent(level: TrainingPlan['level']) {
  if (level === 'advanced') return '#FF7B57';
  if (level === 'intermediate') return '#34D6E8';
  return '#C3FF3B';
}

function getTrainingPlaylist(training: TrainingPlan, songPool: RemoteSong[]) {
  const picked = new Map<string, RemoteSong>();
  for (const segment of training.segments) {
    const target = segment.targetCadence;
    const match = [...songPool]
      .sort(
        (a, b) =>
          Math.abs((a.cadenceTarget ?? a.effectiveBpm ?? a.bpmHint) - target) -
          Math.abs((b.cadenceTarget ?? b.effectiveBpm ?? b.bpmHint) - target)
      )
      .find((song) => !picked.has(song.id));
    if (match) {
      picked.set(match.id, match);
    }
  }

  return training.segments
    .map((segment, index) => {
      const song = [...picked.values()][Math.min(index, picked.size - 1)];
      if (!song) return null;
      return { segment, song };
    })
    .filter(Boolean) as Array<{ segment: TrainingPlan['segments'][number]; song: RemoteSong }>;
}

function TrainingTimeline({
  training,
  activeSegment,
  elapsedSeconds,
}: {
  training: TrainingPlan;
  activeSegment: TrainingPlan['segments'][number] | null;
  elapsedSeconds: number;
}) {
  return (
    <View style={styles.timelineRow}>
      {training.segments.map((segment, index) => {
        const duration = Math.max(1, segment.minuteEnd - segment.minuteStart);
        const segStart = segment.minuteStart * 60;
        const segEnd = segment.minuteEnd * 60;
        const current = segment === activeSegment;
        const done = elapsedSeconds >= segEnd;
        const progress = current ? Math.max(0, Math.min(1, (elapsedSeconds - segStart) / Math.max(1, segEnd - segStart))) : done ? 1 : 0;

        return (
          <View
            key={`${training.id}-timeline-${index}`}
            style={[
              styles.timelineBlock,
              {
                flex: duration,
                borderColor: current ? getTrainingAccent(training.level) : '#2A3139',
              },
            ]}
          >
            <View style={[styles.timelineFill, { width: `${progress * 100}%`, opacity: current ? 1 : done ? 0.55 : 0.08 }]} />
            <Text style={[styles.timelineLabel, current && { color: getTrainingAccent(training.level) }]}>{segment.targetCadence}</Text>
          </View>
        );
      })}
    </View>
  );
}

function TrainingRampChart({ training, accent }: { training: TrainingPlan; accent: string }) {
  const range = getTrainingRange(training);
  const floor = 135;
  const ceiling = 195;

  return (
    <View style={styles.rampChartShell}>
      <View style={styles.rampChartBand} />
      <View style={styles.rampChartRow}>
        {training.segments.map((segment, index) => {
          const flex = Math.max(1, segment.minuteEnd - segment.minuteStart);
          const height = Math.max(12, ((segment.targetCadence - floor) / (ceiling - floor)) * 96);
          return (
            <View key={`${training.id}-chart-${index}`} style={[styles.rampChartColumn, { flex }]}>
              <View style={[styles.rampChartStep, { height, backgroundColor: `${accent}55`, borderColor: accent }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.rampChartAxis}>0 min</Text>
        <Text style={styles.rampChartAxis}>{range.min}-{range.max} BPM</Text>
        <Text style={styles.rampChartAxis}>{training.durationMinutes} min</Text>
      </View>
    </View>
  );
}

function TrainingsScreenV2(props: {
  trainings: TrainingPlan[];
  selectedTrainingId: string | null;
  isFetchingTrainings: boolean;
  trainingsError: string | null;
  currentCadence: number;
  currentSegment: TrainingPlan['segments'][number] | null;
  onRefresh: () => void;
  onSelectTraining: (value: string) => void;
  onStartTraining: (value: string) => void;
  onOpenDetails: (value: string) => void;
}) {
  const selectedTraining = props.trainings.find((training) => training.id === props.selectedTrainingId) ?? null;
  const selectedRange = selectedTraining ? getTrainingRange(selectedTraining) : null;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Treinos</Text>
      <Text style={styles.buildBadge}>{VISUAL_BUILD_LABEL}</Text>
      <Text style={styles.subtitle}>Programas progressivos: a cadencia sobe em etapas e a musica acompanha o seu ritmo.</Text>

      <Card>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.cardLabel}>Cadencia atual</Text>
            <Text style={[styles.metricValue, { color: '#C3FF3B' }]}>{props.currentCadence} BPM</Text>
          </View>
          <Pressable onPress={props.onRefresh} style={styles.secondaryButtonCompact}>
            <Text style={styles.secondaryButtonText}>Atualizar treinos</Text>
          </Pressable>
        </View>
        <Text style={styles.metricHint}>
          {props.currentSegment
            ? `Segmento ativo: ${props.currentSegment.minuteStart}-${props.currentSegment.minuteEnd} min · alvo ${props.currentSegment.targetCadence} BPM`
            : 'Selecione um treino para guiar a corrida por cadencia.'}
        </Text>
      </Card>

      {props.isFetchingTrainings ? (
        <Card>
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#C3FF3B" />
            <Text style={styles.metricHint}>Carregando treinos...</Text>
          </View>
        </Card>
      ) : null}

      {props.trainingsError ? (
        <Card>
          <Text style={styles.errorText}>{props.trainingsError}</Text>
        </Card>
      ) : null}

      {props.trainings.map((training) => {
        const range = getTrainingRange(training);
        const accent = getTrainingAccent(training.level);
        const active = props.selectedTrainingId === training.id;

        return (
          <Pressable
            key={training.id}
            onPress={() => {
              props.onSelectTraining(training.id);
              props.onOpenDetails(training.id);
            }}
            style={[styles.trainingHeroCard, active && styles.trainingHeroCardActive]}
          >
            <View style={styles.rowBetween}>
              <View style={[styles.trainingLevelPill, { backgroundColor: `${accent}22` }]}>
                <View style={[styles.trainingLevelDot, { backgroundColor: accent }]} />
                <Text style={[styles.trainingLevelText, { color: accent }]}>{training.level}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#7D8790" />
            </View>
            <Text style={styles.trainingHeroTitle}>{training.name}</Text>
            <Text style={styles.trainingHeroSubtitle}>
              {training.tagline ?? 'Treino progressivo para subir a cadencia com consistencia.'}
            </Text>
            <TrainingRampChart training={training} accent={accent} />
            <View style={styles.trainingMetaRow}>
              <TrainingMeta label="Duracao" value={`${training.durationMinutes}`} unit="min" />
              <TrainingMeta label="Cadencia" value={`${range.min}-${range.max}`} unit="spm" />
              <TrainingMeta label="Etapas" value={`${training.segments.length}`} unit="" />
            </View>
          </Pressable>
        );
      })}

      {selectedTraining && selectedRange ? (
        <Card>
          <Text style={styles.cardLabel}>{selectedTraining.name}</Text>
          <Text style={styles.metricHint}>{selectedTraining.tagline ?? 'Treino progressivo pronto para iniciar.'}</Text>
          <View style={styles.rowBetween}>
            <Stat label="Duracao" value={`${selectedTraining.durationMinutes} min`} />
            <Stat label="Cadencia" value={`${selectedRange.min}-${selectedRange.max}`} />
            <Stat label="Etapas" value={`${selectedTraining.segments.length}`} />
          </View>
          <Pressable onPress={() => props.onStartTraining(selectedTraining.id)} style={styles.primaryButton}>
            <Ionicons name="play" size={20} color="#0D1116" />
            <Text style={styles.primaryButtonText}>Iniciar treino</Text>
          </Pressable>
        </Card>
      ) : null}
    </View>
  );
}

function TrainingDetailSheetV2(props: {
  training: TrainingPlan;
  songPool: RemoteSong[];
  onPlaySong: (song: RemoteSong) => void;
  onOpenSong: (song: RemoteSong) => void;
  onClose: () => void;
  onStart: () => void;
}) {
  const range = getTrainingRange(props.training);
  const accent = getTrainingAccent(props.training.level);
  const playlist = getTrainingPlaylist(props.training, props.songPool).slice(0, 4);

  return (
    <ScrollView
      style={styles.sheetScroll}
      contentContainerStyle={styles.sheetScrollContent}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      <View style={styles.sheetContent}>
        <View style={styles.sheetHandle} />
        <View style={styles.rowBetween}>
          <View style={[styles.trainingLevelPill, { backgroundColor: `${accent}22` }]}>
            <View style={[styles.trainingLevelDot, { backgroundColor: accent }]} />
            <Text style={[styles.trainingLevelText, { color: accent }]}>{props.training.level}</Text>
          </View>
          <Pressable onPress={props.onClose} style={styles.playerCloseButton}>
            <Ionicons name="close" size={20} color="#F4F7FB" />
          </Pressable>
        </View>
        <Text style={styles.sheetTitle}>{props.training.name}</Text>
        <Text style={styles.subtitle}>
          {props.training.tagline ?? 'Treino progressivo para subir a cadencia em etapas com controle.'}
        </Text>

        <View style={styles.trainingDetailPanel}>
          <TrainingRampChart training={props.training} accent={accent} />
        </View>

        <View style={styles.trainingStatBoxes}>
          <TrainingStatBox icon="flag-outline" label="Duracao" value={`${props.training.durationMinutes} min`} />
          <TrainingStatBox icon="pulse-outline" label="Cadencia" value={`${range.min}-${range.max}`} />
          <TrainingStatBox icon="layers-outline" label="Etapas" value={`${props.training.segments.length}`} />
        </View>

        {props.training.goals && props.training.goals.length > 0 ? (
          <View style={styles.trainingSection}>
            <Text style={styles.trainingSectionLabel}>Objetivos</Text>
            <View style={styles.trainingGoals}>
              {props.training.goals.map((goal) => (
                <View key={goal} style={styles.trainingGoalRow}>
                  <View style={[styles.trainingGoalIcon, { backgroundColor: `${accent}22` }]}>
                    <Ionicons name="checkmark" size={12} color={accent} />
                  </View>
                  <Text style={styles.trainingGoalText}>{goal}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {playlist.length > 0 ? (
          <View style={styles.trainingSection}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.trainingSectionLabel}>Playlist no ritmo</Text>
                <Text style={styles.metricHint}>mesma cadencia, faixas diferentes</Text>
              </View>
            </View>
            <View style={styles.trainingPlaylistStack}>
              {playlist.map(({ segment, song }) => (
                <Pressable
                  key={`${props.training.id}-${song.id}-${segment.minuteStart}`}
                  onPress={() => props.onPlaySong(song)}
                  onLongPress={() => props.onOpenSong(song)}
                  style={styles.trainingPlaylistCard}
                >
                  <RemoteSongRow song={song} active={false} />
                  <Text style={styles.trainingPlaylistTime}>
                    {segment.minuteStart}-{segment.minuteEnd} min
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.trainingSection}>
          <Text style={styles.trainingSectionLabel}>Progressao por etapa</Text>
          <View style={styles.trainingSegmentsColumn}>
            {props.training.segments.map((segment, index) => (
              <View key={`${props.training.id}-detail-v2-${index}`} style={styles.trainingSegmentDetailCard}>
                <Text style={styles.trainingSegmentTime}>
                  {segment.minuteStart}-{segment.minuteEnd} min
                </Text>
                <View style={styles.trainingSegmentDetailTrack}>
                  <View
                    style={[
                      styles.trainingSegmentDetailFill,
                      {
                        width: `${((segment.targetCadence - 135) / (195 - 135)) * 100}%`,
                        backgroundColor: accent,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.trainingSegmentCadence}>{segment.targetCadence}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable onPress={props.onStart} style={styles.primaryButton}>
          <Ionicons name="play" size={20} color="#0D1116" />
          <Text style={styles.primaryButtonText}>Iniciar treino</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function RunScreenV2(props: {
  cadence: number;
  distanceKm: number;
  elapsed: number;
  pace: number;
  running: boolean;
  started: boolean;
  currentFoot: string;
  selectedTraining: TrainingPlan | null;
  activeTrainingSegment: TrainingPlan['segments'][number] | null;
  onStart: () => void;
  onOpenTrainings: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  musicEnabled: boolean;
  onToggleMusic: () => void;
  selectedTrack: Track | null;
  selectedSong: RemoteSong | null;
  nextTrack: () => void;
  onOpenRemoteSong: () => void;
  onOpenEmbeddedSong: () => void;
  onOpenMusicSearch: () => void;
  metronomeVolume: number;
  musicVolume: number;
  onChangeMetronomeVolume: (value: number) => void;
  onChangeMusicVolume: (value: number) => void;
}) {
  const segmentIndex =
    props.selectedTraining && props.activeTrainingSegment
      ? props.selectedTraining.segments.findIndex((segment) => segment === props.activeTrainingSegment)
      : -1;
  const nextSegment =
    props.selectedTraining && segmentIndex >= 0 && segmentIndex < props.selectedTraining.segments.length - 1
      ? props.selectedTraining.segments[segmentIndex + 1]
      : null;

  if (!props.started) {
    return (
      <View style={[styles.screen, styles.centeredScreen]}>
        <View style={styles.startRing}>
          <MaterialCommunityIcons name="heart-pulse" size={34} color="#C3FF3B" />
        </View>
        <Text style={styles.title}>Pronto para correr</Text>
        <Text style={styles.subtitle}>Cadencia {props.cadence} BPM · pace {formatPace(props.pace)} /km</Text>
        {props.selectedTraining ? (
          <View style={styles.runTrainingPreview}>
            <View style={styles.rowBetween}>
              <View style={styles.levelBadge}>
                <View style={styles.levelDot} />
                <Text style={styles.levelBadgeText}>{props.selectedTraining.level}</Text>
              </View>
              <Text style={styles.metricHint}>{props.selectedTraining.durationMinutes} min</Text>
            </View>
            <Text style={styles.runTrainingPreviewTitle}>{props.selectedTraining.name}</Text>
            <Text style={styles.runTrainingPreviewSubtitle}>
              {props.selectedTraining.tagline ?? 'Treino progressivo com cadencia guiada em etapas.'}
            </Text>
            <TrainingTimeline
              training={props.selectedTraining}
              activeSegment={props.selectedTraining.segments[0] ?? null}
              elapsedSeconds={0}
            />
          </View>
        ) : null}
        <View style={styles.startActions}>
          <Pressable onPress={props.onStart} style={styles.primaryButton}>
            <Ionicons name="play" size={20} color="#0D1116" />
            <Text style={styles.primaryButtonText}>Corrida livre</Text>
          </Pressable>
          <Pressable onPress={props.onOpenTrainings} style={styles.runGhostButton}>
            <Ionicons name="fitness-outline" size={18} color="#F4F7FB" />
            <Text style={styles.runGhostButtonText}>Escolher um treino</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.runHeader}>
        <Stat label="Tempo" value={formatClock(props.elapsed)} emphasis />
        <Stat label="Distancia" value={`${props.distanceKm.toFixed(2)} km`} emphasis />
        <Stat label="Pace" value={`${formatPace(props.pace)} /km`} emphasis />
      </View>

      {props.selectedTraining && props.activeTrainingSegment ? (
        <View style={styles.runTrainingCard}>
          <View style={styles.rowBetween}>
            <View style={styles.levelBadge}>
              <View style={styles.levelDot} />
              <Text style={styles.levelBadgeText}>{props.selectedTraining.level}</Text>
            </View>
            <Text style={styles.metricHint}>
              etapa {segmentIndex + 1}/{props.selectedTraining.segments.length}
            </Text>
          </View>
          <Text style={styles.runTrainingTitle}>{props.selectedTraining.name}</Text>
          <View style={styles.rowBetween}>
            <Stat
              label="Segmento"
              value={`${props.activeTrainingSegment.minuteStart}-${props.activeTrainingSegment.minuteEnd} min`}
            />
            <Stat label="Alvo" value={`${props.activeTrainingSegment.targetCadence} BPM`} />
          </View>
          <TrainingTimeline
            training={props.selectedTraining}
            activeSegment={props.activeTrainingSegment}
            elapsedSeconds={props.elapsed}
          />
        </View>
      ) : null}

      <View style={styles.beatShell}>
        <View style={[styles.beatCore, props.running && styles.beatCoreActive]}>
          <Text style={styles.beatNumber}>{props.cadence}</Text>
          <Text style={styles.beatLabel}>BPM</Text>
          <View style={styles.footBadge}>
            <View style={[styles.footDot, props.running && styles.footDotActive]} />
            <Text style={styles.footText}>{props.running ? `Pisada ${props.currentFoot.toLowerCase()}` : 'Pausado'}</Text>
          </View>
        </View>
      </View>

      {props.selectedTraining && props.activeTrainingSegment ? (
        <View style={styles.runNextHint}>
          {nextSegment ? (
            <>
              <Text style={styles.runNextArrow}>
                {nextSegment.targetCadence >= props.activeTrainingSegment.targetCadence ? '▲' : '▼'}
              </Text>
              <Text style={styles.runNextHintText}>
                Proxima cadencia <Text style={styles.runNextCadence}>{nextSegment.targetCadence}</Text> em{' '}
                {formatClock(Math.max(0, nextSegment.minuteStart * 60 - props.elapsed))}
              </Text>
            </>
          ) : (
            <Text style={styles.runNextHintText}>Etapa final — segure o ritmo.</Text>
          )}
        </View>
      ) : null}

      {props.selectedSong ? (
        <View style={styles.nowPlayingCard}>
          <Text style={styles.cardLabel}>Agora no YouTube Music</Text>
          <RemoteSongRow song={props.selectedSong} active />
          <View style={styles.nowPlayingActions}>
            <Pressable onPress={props.onToggleMusic} style={styles.compactButton}>
              <Ionicons name={props.musicEnabled ? 'pause' : 'play'} size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>{props.musicEnabled ? 'Som local off' : 'Som local on'}</Text>
            </Pressable>
            <Pressable onPress={props.onOpenEmbeddedSong} style={styles.compactButton}>
              <Ionicons name="play-circle-outline" size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>Tocar aqui</Text>
            </Pressable>
          </View>
          <View style={styles.nowPlayingActions}>
            <Pressable onPress={props.onOpenRemoteSong} style={styles.compactButton}>
              <Ionicons name="open-outline" size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>Abrir musica</Text>
            </Pressable>
            <Pressable onPress={props.nextTrack} style={styles.compactButton}>
              <Ionicons name="play-skip-forward" size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>Proxima sugestao</Text>
            </Pressable>
            <Pressable onPress={props.onOpenMusicSearch} style={styles.compactButton}>
              <Ionicons name="search" size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>Busca aberta</Text>
            </Pressable>
          </View>
        </View>
      ) : props.selectedTrack ? (
        <Card>
          <TrackRow track={props.selectedTrack} distance={0} active />
          <View style={styles.rowBetween}>
            <Pressable onPress={props.onToggleMusic} style={styles.compactButton}>
              <Ionicons name={props.musicEnabled ? 'pause' : 'play'} size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>{props.musicEnabled ? 'Pausar demo' : 'Tocar demo'}</Text>
            </Pressable>
            <Pressable onPress={props.nextTrack} style={styles.compactButton}>
              <Ionicons name="play-skip-forward" size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>Proxima demo</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      <View style={styles.rowBetween}>
        <Pressable onPress={props.running ? props.onPause : props.onResume} style={styles.secondaryControl}>
          <Ionicons name={props.running ? 'pause' : 'play'} size={18} color="#F4F7FB" />
          <Text style={styles.secondaryControlText}>{props.running ? 'Pausar' : 'Continuar'}</Text>
        </Pressable>
        <Pressable onPress={props.onStop} style={styles.stopControl}>
          <Ionicons name="stop" size={18} color="#0D1116" />
          <Text style={styles.stopControlText}>Encerrar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TrainingMeta({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.trainingMetaBlock}>
      <Text style={styles.trainingMetaLabel}>{label}</Text>
      <Text style={styles.trainingMetaValue}>
        {value}
        {unit ? <Text style={styles.trainingMetaUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function TrainingStatBox({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.trainingStatBox}>
      <Ionicons name={icon} size={18} color="#C3FF3B" />
      <Text style={styles.trainingStatValue}>{value}</Text>
      <Text style={styles.trainingStatLabel}>{label}</Text>
    </View>
  );
}

function SettingsScreen(props: {
  settings: AppSettings;
  suggestedStride: number;
  onChangeSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onResetStride: () => void;
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Mixer</Text>
      <Text style={styles.buildBadge}>{VISUAL_BUILD_LABEL}</Text>
      <Text style={styles.subtitle}>Equilibre musica e metronomo, ajuste o perfil de corrida e mantenha o bip no comando.</Text>

      <Card>
        <Text style={styles.cardLabel}>Corpo e passada</Text>
        <NumericField
          label="Altura"
          suffix="cm"
          value={props.settings.heightCm}
          onChange={(value) => props.onChangeSettings('heightCm', clamp(value, 130, 220))}
        />
        <NumericField
          label="Comprimento da passada"
          suffix="m"
          precision={2}
          value={props.settings.strideMeters}
          onChange={(value) => props.onChangeSettings('strideMeters', clamp(value, 0.8, 1.35))}
        />
        <Text style={styles.metricHint}>Sugestao automatica pela altura: {props.suggestedStride.toFixed(2)} m</Text>
        <Pressable onPress={props.onResetStride} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Usar sugestao automatica</Text>
        </Pressable>
      </Card>

      <Card>
        <Text style={styles.cardLabel}>Backend YouTube Music</Text>
        <Text style={styles.metricHint}>Conectado automaticamente ao backend publico do RunBeat.</Text>
        <Text style={styles.metricHint}>
          URL ativa: {props.settings.backendUrl}
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardLabel}>Som do metronomo</Text>
        <View style={styles.row}>
          {(['click', 'wood', 'beep', 'kick'] as const).map((sound) => (
            <PillButton
              key={sound}
              active={props.settings.metronomeSound === sound}
              label={sound}
              onPress={() => props.onChangeSettings('metronomeSound', sound)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.cardLabel}>Equilibrio automatico</Text>
        <Text style={styles.metricHint}>Quando ativado, a musica fica sempre abaixo do metronomo.</Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Bip sempre audivel</Text>
            <Text style={styles.switchHint}>Limita a musica abaixo do metronomo</Text>
          </View>
          <Switch
            value={props.settings.autoDuck}
            onValueChange={(value) => props.onChangeSettings('autoDuck', value)}
            trackColor={{ false: '#2D333B', true: '#C3FF3B' }}
            thumbColor={props.settings.autoDuck ? '#0D1116' : '#EEF2F7'}
          />
        </View>
      </Card>

      <Card>
        <Text style={styles.cardLabel}>Volumes</Text>
        <View style={styles.mixerMeters}>
          <MixerMeter
            label="Musica"
            sublabel="player"
            color="#34D6E8"
            value={props.settings.musicVolume}
            icon="musical-notes-outline"
            onChange={(value) => props.onChangeSettings('musicVolume', value)}
            locked={props.settings.autoDuck}
          />
          <View style={styles.mixerDivider} />
          <MixerMeter
            label="Metronomo"
            sublabel="pulso"
            color="#C3FF3B"
            value={props.settings.metronomeVolume}
            icon="pulse-outline"
            onChange={(value) => props.onChangeSettings('metronomeVolume', value)}
          />
        </View>
      </Card>
    </View>
  );
}

function Card({ children }: React.PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

function Stepper({ onDec, onInc }: { onDec: () => void; onInc: () => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onDec} style={styles.stepButton}>
        <Text style={styles.stepButtonText}>-</Text>
      </Pressable>
      <Pressable onPress={onInc} style={styles.stepButton}>
        <Text style={styles.stepButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

function Segmented({ value, onChange }: { value: InputMode; onChange: (value: InputMode) => void }) {
  const options: Array<{ key: InputMode; label: string }> = [
    { key: 'pace', label: 'Pace' },
    { key: 'speed', label: 'Velocidade' },
    { key: 'goal', label: 'Meta' },
  ];

  return (
    <View style={styles.segment}>
      {options.map((option) => (
        <Pressable
          key={option.key}
          onPress={() => onChange(option.key)}
          style={[styles.segmentButton, value === option.key && styles.segmentButtonActive]}
        >
          <Text style={[styles.segmentLabel, value === option.key && styles.segmentLabelActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PillButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, emphasis && styles.statValueLarge]}>{value}</Text>
    </View>
  );
}

function Gauge({ cadence, onChange }: { cadence: number; onChange: (value: number) => void }) {
  const markers = [117, 140, 160, 180, 208];
  const fillPercent = ((cadence - MIN_CADENCE_BPM) / (MAX_CADENCE_BPM - MIN_CADENCE_BPM)) * 100;
  const recommendedLeft = ((RECOMMENDED_MIN_CADENCE_BPM - MIN_CADENCE_BPM) / (MAX_CADENCE_BPM - MIN_CADENCE_BPM)) * 100;
  const recommendedWidth =
    ((RECOMMENDED_MAX_CADENCE_BPM - RECOMMENDED_MIN_CADENCE_BPM) / (MAX_CADENCE_BPM - MIN_CADENCE_BPM)) * 100;
  return (
    <View style={styles.gauge}>
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeRecommended, { left: `${recommendedLeft}%`, width: `${recommendedWidth}%` }]} />
        <View style={[styles.gaugeFill, { width: `${fillPercent}%` }]} />
      </View>
      <View style={styles.rowBetween}>
        {markers.map((marker) => (
          <Pressable key={marker} onPress={() => onChange(marker)}>
            <Text style={[styles.gaugeMarker, marker === cadence && styles.gaugeMarkerActive]}>{marker}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TrackRow({ track, distance, active }: { track: Track; distance: number; active: boolean }) {
  return (
    <View style={[styles.trackRow, active && styles.trackRowActive]}>
      <LinearGradient colors={[track.c1, track.c2]} style={styles.trackCover}>
        <Ionicons name="musical-note" size={20} color="#F8FBFF" />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={styles.trackTitle}>{track.title}</Text>
        <Text style={styles.trackArtist}>{track.artist}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.trackBpm}>{track.bpm}</Text>
        <Text style={styles.trackDistance}>{distance === 0 ? 'Exato' : `±${distance}`}</Text>
      </View>
    </View>
  );
}

function RemoteSongRow({ song, active }: { song: RemoteSong; active: boolean }) {
  const genreText = song.genres && song.genres.length > 0 ? song.genres.slice(0, 2).join(' · ') : getSongArtists(song);
  const metaParts = [song.runningZone, song.energy ? `E${song.energy}` : null, song.subGenre].filter(Boolean);
  const cadenceRange =
    song.cadenceMin && song.cadenceMax ? `${song.cadenceMin}-${song.cadenceMax}` : song.cadenceTarget ? `${song.cadenceTarget}` : null;
  return (
    <View style={[styles.trackRow, active && styles.trackRowActive]}>
      <View style={[styles.trackCover, styles.remoteCover]}>
        <Ionicons name="logo-youtube" size={22} color="#FF4E45" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.trackTitle}>{song.title}</Text>
        <Text style={styles.trackArtist}>{getSongArtists(song)}</Text>
        <Text style={styles.trackMeta}>{genreText}</Text>
        {metaParts.length > 0 ? <Text style={styles.trackMeta}>{metaParts.join(' · ')}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.trackBpm}>{song.durationText ?? `${song.bpmHint} BPM`}</Text>
        <Text style={styles.trackDistance}>{cadenceRange ? `${cadenceRange} cad` : 'YT Music'}</Text>
      </View>
    </View>
  );
}

function NumericField({
  label,
  suffix,
  value,
  onChange,
  precision = 0,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (value: number) => void;
  precision?: number;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(precision > 0 ? value.toFixed(precision) : String(Math.round(value)));
  }, [precision, value]);

  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          keyboardType="decimal-pad"
          value={text}
          onChangeText={(nextText) => {
            setText(nextText);
            const normalized = nextText.replace(',', '.');
            const parsed = Number(normalized);
            if (!Number.isNaN(parsed)) {
              onChange(parsed);
            }
          }}
          style={styles.input}
        />
        <Text style={styles.inputSuffix}>{suffix}</Text>
      </View>
    </View>
  );
}

function VolumeRow({
  label,
  value,
  icon,
  onChange,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.volumeRow}>
      <View style={styles.volumeLabelWrap}>
        <Ionicons name={icon} size={18} color="#C3FF3B" />
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <View style={styles.volumeControls}>
        <Pressable onPress={() => onChange(clamp(Number((value - 0.1).toFixed(2)), 0, 1))} style={styles.volumeButton}>
          <Text style={styles.volumeButtonText}>-</Text>
        </Pressable>
        <View style={styles.volumeBar}>
          <View style={[styles.volumeFill, { width: `${value * 100}%` }]} />
        </View>
        <Pressable onPress={() => onChange(clamp(Number((value + 0.1).toFixed(2)), 0, 1))} style={styles.volumeButton}>
          <Text style={styles.volumeButtonText}>+</Text>
        </Pressable>
        <Text style={styles.volumeValue}>{Math.round(value * 100)}%</Text>
      </View>
    </View>
  );
}

function MixerMeter({
  label,
  sublabel,
  value,
  color,
  icon,
  onChange,
  locked,
}: {
  label: string;
  sublabel: string;
  value: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  onChange: (value: number) => void;
  locked?: boolean;
}) {
  return (
    <View style={styles.meterWrap}>
      <View style={[styles.meterIconWrap, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.meterRail}>
        {[0.25, 0.5, 0.75].map((tick) => (
          <View key={tick} style={[styles.meterTick, { bottom: `${tick * 100}%` }]} />
        ))}
        <View style={[styles.meterFill, { height: `${value * 100}%`, backgroundColor: color }]} />
        <View style={[styles.meterKnob, { bottom: `${value * 100}%` }]}>
          <View style={styles.meterKnobGrip} />
          <View style={styles.meterKnobGrip} />
          <View style={styles.meterKnobGrip} />
        </View>
        {locked ? <Text style={styles.meterLock}>L</Text> : null}
      </View>
      <View style={styles.meterButtons}>
        <Pressable onPress={() => onChange(clamp(Number((value + 0.05).toFixed(2)), 0, 1))} style={styles.meterButton}>
          <Text style={styles.volumeButtonText}>+</Text>
        </Pressable>
        <Pressable onPress={() => onChange(clamp(Number((value - 0.05).toFixed(2)), 0, 1))} style={styles.meterButton}>
          <Text style={styles.volumeButtonText}>-</Text>
        </Pressable>
      </View>
      <Text style={styles.meterValue}>
        {Math.round(value * 100)}
        <Text style={styles.meterUnit}>%</Text>
      </Text>
      <Text style={[styles.meterLabel, { color }]}>{label}</Text>
      <Text style={styles.meterSubLabel}>{sublabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F13',
  },
  appShell: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 120,
    gap: 16,
  },
  screen: {
    gap: 16,
  },
  centeredScreen: {
    minHeight: 620,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startActions: {
    width: '100%',
    maxWidth: 300,
    marginTop: 8,
    gap: 10,
  },
  runGhostButton: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2B333A',
    backgroundColor: '#171D23',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  runGhostButtonText: {
    color: '#F4F7FB',
    fontWeight: '800',
  },
  eyebrow: {
    color: '#C3FF3B',
    fontSize: 12,
    letterSpacing: 2.2,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  buildBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(52, 214, 232, 0.16)',
    color: '#34D6E8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#F3F7FC',
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: '#95A0AB',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#13181D',
    borderWidth: 1,
    borderColor: '#222A31',
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  cardLabel: {
    color: '#6F7A84',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  metricValue: {
    color: '#F4F7FB',
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  metricUnit: {
    color: '#8A95A1',
    fontSize: 17,
    fontWeight: '600',
  },
  metricHint: {
    color: '#8A95A1',
    fontSize: 13,
  },
  smallHint: {
    color: '#8A95A1',
    fontSize: 12,
    marginTop: 4,
  },
  stepper: {
    flexDirection: 'row',
    gap: 8,
  },
  stepButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#293038',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#191F25',
  },
  stepButtonText: {
    color: '#F4F7FB',
    fontSize: 28,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: '#151A20',
    borderWidth: 1,
    borderColor: '#232A32',
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#C3FF3B',
  },
  segmentLabel: {
    color: '#8C96A2',
    fontSize: 13,
    fontWeight: '700',
  },
  segmentLabelActive: {
    color: '#091015',
  },
  goalBlock: {
    gap: 16,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2B323B',
    backgroundColor: '#161C22',
  },
  pillActive: {
    backgroundColor: '#C3FF3B',
    borderColor: '#C3FF3B',
  },
  pillLabel: {
    color: '#A7B1BC',
    fontWeight: '700',
  },
  pillLabelActive: {
    color: '#0B1116',
  },
  gauge: {
    gap: 10,
  },
  gaugeTrack: {
    height: 42,
    borderRadius: 14,
    backgroundColor: '#1A2026',
    borderWidth: 1,
    borderColor: '#2A323A',
    overflow: 'hidden',
  },
  gaugeRecommended: {
    position: 'absolute',
    left: '25%',
    width: '50%',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(195,255,59,0.12)',
  },
  gaugeFill: {
    height: '100%',
    backgroundColor: 'rgba(195,255,59,0.22)',
  },
  gaugeMarker: {
    color: '#7E8893',
    fontSize: 12,
    fontWeight: '700',
  },
  gaugeMarkerActive: {
    color: '#C3FF3B',
  },
  stat: {
    flex: 1,
    gap: 4,
  },
  statLabel: {
    color: '#6F7A84',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontWeight: '700',
  },
  statValue: {
    color: '#F4F7FB',
    fontSize: 13,
    fontWeight: '700',
  },
  statValueLarge: {
    fontSize: 22,
    letterSpacing: -0.5,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#2A3139',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#171D23',
  },
  secondaryButtonCompact: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2A3139',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#171D23',
  },
  secondaryButtonText: {
    color: '#D9E1E9',
    fontWeight: '700',
  },
  primaryButton: {
    borderRadius: 20,
    backgroundColor: '#C3FF3B',
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#C3FF3B',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 8,
  },
  primaryButtonText: {
    color: '#0D1116',
    fontSize: 17,
    fontWeight: '800',
  },
  runHeader: {
    flexDirection: 'row',
    gap: 10,
  },
  beatShell: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beatCore: {
    width: 260,
    height: 260,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#2A3138',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10151A',
  },
  beatCoreActive: {
    borderColor: '#C3FF3B',
    shadowColor: '#C3FF3B',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    elevation: 5,
  },
  beatNumber: {
    color: '#F4F7FB',
    fontSize: 78,
    fontWeight: '800',
    letterSpacing: -3,
  },
  beatLabel: {
    color: '#7E8893',
    fontSize: 13,
    letterSpacing: 3,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  footBadge: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#273039',
    backgroundColor: '#171D23',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  footDot: {
    width: 10,
    height: 10,
    borderRadius: 99,
    backgroundColor: '#505A65',
  },
  footDotActive: {
    backgroundColor: '#C3FF3B',
  },
  footText: {
    color: '#B0BAC5',
    fontSize: 13,
    fontWeight: '700',
  },
  trackRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  trackRowActive: {
    backgroundColor: 'rgba(41, 184, 255, 0.05)',
    borderRadius: 16,
    paddingHorizontal: 10,
  },
  trackCover: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteCover: {
    backgroundColor: '#181C22',
    borderWidth: 1,
    borderColor: '#2B333B',
  },
  trackTitle: {
    color: '#F4F7FB',
    fontSize: 15,
    fontWeight: '700',
  },
  trackArtist: {
    color: '#8A95A1',
    fontSize: 12,
  },
  trackMeta: {
    color: '#6F7A84',
    fontSize: 11,
    marginTop: 2,
  },
  trackBpm: {
    color: '#F4F7FB',
    fontSize: 15,
    fontWeight: '800',
  },
  trackDistance: {
    color: '#8A95A1',
    fontSize: 11,
    fontWeight: '700',
  },
  compactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A3139',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#171D23',
  },
  compactButtonText: {
    color: '#F4F7FB',
    fontWeight: '700',
    fontSize: 13,
  },
  volumeRow: {
    gap: 10,
  },
  mixerMeters: {
    flexDirection: 'row',
    minHeight: 260,
    gap: 16,
    alignItems: 'stretch',
  },
  mixerDivider: {
    width: 1,
    backgroundColor: '#222A32',
  },
  meterWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  meterIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meterRail: {
    width: 68,
    flex: 1,
    minHeight: 190,
    borderRadius: 24,
    backgroundColor: '#171D23',
    borderWidth: 1,
    borderColor: '#293038',
    overflow: 'hidden',
    position: 'relative',
  },
  meterTick: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#2A3139',
  },
  meterFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  meterKnob: {
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: -28 }, { translateY: 13 }],
    width: 56,
    height: 26,
    borderRadius: 10,
    backgroundColor: '#13181D',
    borderWidth: 1,
    borderColor: '#2A3139',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  meterKnobGrip: {
    width: 10,
    height: 2,
    borderRadius: 99,
    backgroundColor: '#6F7A84',
  },
  meterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  meterButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#293038',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#191F25',
  },
  meterValue: {
    color: '#F4F7FB',
    fontSize: 22,
    fontWeight: '700',
  },
  meterUnit: {
    color: '#8A95A1',
    fontSize: 12,
    fontWeight: '600',
  },
  meterLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  meterSubLabel: {
    color: '#6F7A84',
    fontSize: 11,
    marginTop: -6,
  },
  meterLock: {
    position: 'absolute',
    top: 8,
    left: '50%',
    transform: [{ translateX: -4 }],
    color: '#F4F7FB',
    fontSize: 10,
    fontWeight: '800',
  },
  volumeLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  volumeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  volumeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#293038',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#191F25',
  },
  volumeButtonText: {
    color: '#F4F7FB',
    fontSize: 20,
  },
  volumeBar: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#1B2127',
    overflow: 'hidden',
  },
  volumeFill: {
    height: '100%',
    backgroundColor: '#C3FF3B',
  },
  volumeValue: {
    width: 42,
    color: '#A8B2BD',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  secondaryControl: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2B333A',
    backgroundColor: '#171D23',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryControlText: {
    color: '#F4F7FB',
    fontWeight: '800',
  },
  stopControl: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#C3FF3B',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  stopControlText: {
    color: '#0D1116',
    fontWeight: '800',
  },
  startRing: {
    width: 100,
    height: 100,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2B333A',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12171C',
    marginBottom: 10,
  },
  emptyText: {
    color: '#8A95A1',
    lineHeight: 22,
  },
  errorText: {
    color: '#FF7B7B',
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bandBlock: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#222A31',
  },
  bandTitle: {
    color: '#F4F7FB',
    fontSize: 15,
    fontWeight: '800',
  },
  bandHint: {
    color: '#8A95A1',
    fontSize: 12,
    marginTop: 2,
  },
  bandBpm: {
    color: '#C3FF3B',
    fontSize: 14,
    fontWeight: '800',
  },
  listHeading: {
    color: '#95A0AB',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  linkAccent: {
    color: '#C3FF3B',
    fontSize: 13,
    fontWeight: '800',
  },
  trainingCard: {
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#222A31',
  },
  trainingHeroCard: {
    backgroundColor: '#11161B',
    borderWidth: 1,
    borderColor: '#242C34',
    borderRadius: 24,
    padding: 16,
    gap: 12,
  },
  trainingHeroCardActive: {
    shadowColor: '#C3FF3B',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  trainingHeroTitle: {
    color: '#F4F7FB',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  trainingHeroSubtitle: {
    color: '#9BA6B2',
    fontSize: 14,
    lineHeight: 20,
  },
  trainingLevelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  trainingLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  trainingLevelText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rampChartShell: {
    gap: 8,
  },
  rampChartBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 22,
    bottom: 22,
    borderRadius: 16,
    backgroundColor: 'rgba(195, 255, 59, 0.08)',
  },
  rampChartRow: {
    height: 96,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  rampChartColumn: {
    justifyContent: 'flex-end',
  },
  rampChartStep: {
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 1,
    minHeight: 12,
  },
  rampChartAxis: {
    color: '#77818B',
    fontSize: 11,
    fontWeight: '700',
  },
  trainingMetaRow: {
    flexDirection: 'row',
    gap: 18,
  },
  trainingMetaBlock: {
    gap: 3,
  },
  trainingMetaLabel: {
    color: '#7D8790',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  trainingMetaValue: {
    color: '#F4F7FB',
    fontSize: 18,
    fontWeight: '800',
  },
  trainingMetaUnit: {
    color: '#8A95A1',
    fontSize: 11,
    fontWeight: '700',
  },
  trainingCardActive: {
    backgroundColor: 'rgba(195, 255, 59, 0.06)',
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  trainingSegments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trainingRangeBar: {
    flexDirection: 'row',
    gap: 4,
    height: 8,
  },
  trainingRangeStep: {
    borderRadius: 999,
    backgroundColor: 'rgba(195, 255, 59, 0.38)',
  },
  trainingSegmentPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2B333A',
    backgroundColor: '#12171C',
  },
  trainingSegmentText: {
    color: '#BFC8D2',
    fontSize: 12,
    fontWeight: '700',
  },
  trainingGoals: {
    gap: 8,
    marginTop: 12,
    marginBottom: 14,
  },
  trainingGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trainingGoalText: {
    color: '#D9E1E9',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  trainingSegmentsColumn: {
    gap: 10,
  },
  trainingSection: {
    gap: 10,
  },
  trainingSectionLabel: {
    color: '#8995A1',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  trainingGoalIcon: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trainingPlaylistStack: {
    gap: 8,
  },
  trainingPlaylistCard: {
    gap: 8,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#242C34',
    backgroundColor: '#141A20',
  },
  trainingPlaylistTime: {
    alignSelf: 'flex-end',
    color: '#8A95A1',
    fontSize: 12,
    fontWeight: '700',
  },
  trainingSegmentDetailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242C34',
    backgroundColor: '#141A20',
  },
  trainingSegmentDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trainingSegmentTime: {
    minWidth: 72,
    color: '#95A0AB',
    fontSize: 12,
    fontWeight: '700',
  },
  trainingSegmentDetailTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#232A32',
    overflow: 'hidden',
  },
  trainingSegmentDetailFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#C3FF3B',
  },
  trainingSegmentCadence: {
    width: 42,
    textAlign: 'right',
    color: '#F4F7FB',
    fontSize: 14,
    fontWeight: '800',
  },
  fieldRow: {
    gap: 8,
  },
  fieldLabel: {
    color: '#D9E1E9',
    fontSize: 14,
    fontWeight: '700',
  },
  inputShell: {
    borderWidth: 1,
    borderColor: '#293038',
    backgroundColor: '#181E24',
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: {
    color: '#F4F7FB',
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  inputSuffix: {
    color: '#8A95A1',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  switchTitle: {
    color: '#F4F7FB',
    fontWeight: '700',
    fontSize: 15,
  },
  switchHint: {
    color: '#8A95A1',
    fontSize: 12,
    marginTop: 3,
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderColor: '#222A32',
    backgroundColor: 'rgba(11, 15, 19, 0.96)',
    flexDirection: 'row',
    paddingTop: 10,
    paddingBottom: 28,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabLabel: {
    color: '#737B84',
    fontSize: 11,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#C3FF3B',
  },
  playerSafeArea: {
    flex: 1,
    backgroundColor: '#0B0F13',
  },
  playerHeader: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222A32',
    backgroundColor: 'rgba(11, 15, 19, 0.96)',
  },
  playerTitle: {
    color: '#F4F7FB',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  playerCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#171D23',
    borderWidth: 1,
    borderColor: '#2A3139',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerWebView: {
    flex: 1,
    backgroundColor: '#0B0F13',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: '#0B0F13',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: '#222A32',
    overflow: 'hidden',
  },
  sheetContent: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 16,
  },
  sheetScroll: {
    maxHeight: '100%',
  },
  sheetScrollContent: {
    paddingBottom: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#2A3139',
    marginBottom: 4,
  },
  sheetTitle: {
    color: '#F4F7FB',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  trainingDetailPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#252D35',
    backgroundColor: '#141A20',
    padding: 14,
  },
  trainingStatBoxes: {
    flexDirection: 'row',
    gap: 10,
  },
  trainingStatBox: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252D35',
    backgroundColor: '#141A20',
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 6,
  },
  trainingStatValue: {
    color: '#F4F7FB',
    fontSize: 16,
    fontWeight: '800',
  },
  trainingStatLabel: {
    color: '#8A95A1',
    fontSize: 11,
    fontWeight: '700',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(195, 255, 59, 0.12)',
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#C3FF3B',
  },
  levelBadgeText: {
    color: '#C3FF3B',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 4,
    height: 40,
  },
  timelineBlock: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#171D23',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  timelineFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(195,255,59,0.24)',
  },
  timelineLabel: {
    color: '#8A95A1',
    fontSize: 12,
    fontWeight: '800',
  },
  runTrainingPreview: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#252D35',
    backgroundColor: '#12171C',
    padding: 16,
    gap: 10,
  },
  runTrainingPreviewTitle: {
    color: '#F4F7FB',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  runTrainingPreviewSubtitle: {
    color: '#8A95A1',
    fontSize: 14,
    lineHeight: 20,
  },
  runTrainingCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#252D35',
    backgroundColor: '#12171C',
    padding: 14,
    gap: 12,
  },
  runTrainingTitle: {
    color: '#F4F7FB',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  runNextHint: {
    marginTop: -6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  runNextArrow: {
    color: '#C3FF3B',
    fontSize: 13,
    fontWeight: '900',
  },
  runNextHintText: {
    color: '#8A95A1',
    fontSize: 12.5,
    fontWeight: '700',
  },
  runNextCadence: {
    color: '#F4F7FB',
    fontWeight: '900',
  },
  nowPlayingCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#252D35',
    backgroundColor: '#12171C',
    padding: 14,
    gap: 10,
  },
  nowPlayingActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
});
