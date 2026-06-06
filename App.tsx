import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { useRunBeatAudio } from './src/audio/useRunBeatAudio';
import { TRACKS } from './src/data/tracks';
import { AppSettings, AppTab, InputMode, Track } from './src/types';
import {
  DEFAULT_SETTINGS,
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

const STORAGE_KEY = 'runbeat-settings-v1';

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
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as Partial<AppSettings>;
        setSettings((current) => ({ ...current, ...parsed }));
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
  const cadence = cadenceOverride ?? autoCadence;
  const liveStride = useMemo(() => strideFor(effectiveSpeed, cadence), [cadence, effectiveSpeed]);

  const rankedTracks = useMemo(() => getAllTracksSorted(TRACKS, cadence), [cadence]);
  const suggestedTracks = useMemo(
    () => getSuggestedTracks(TRACKS, cadence, settings.tolerance),
    [cadence, settings.tolerance]
  );
  const selectedTrack = useMemo(
    () => rankedTracks.find((entry) => entry.track.id === selectedTrackId)?.track ?? rankedTracks[0]?.track ?? null,
    [rankedTracks, selectedTrackId]
  );

  useEffect(() => {
    if (!selectedTrack && rankedTracks[0]) {
      setSelectedTrackId(rankedTracks[0].track.id);
    }
  }, [rankedTracks, selectedTrack]);

  useEffect(() => {
    if (!running) return;

    const id = setInterval(() => {
      setElapsed((current) => current + 1);
      setDistanceKm((current) => current + effectiveSpeed / 3600);
    }, 1000);

    return () => clearInterval(id);
  }, [effectiveSpeed, running]);

  useRunBeatAudio({
    cadence,
    metronomeSound: settings.metronomeSound,
    metronomeVolume: settings.metronomeVolume,
    musicVolume: settings.autoDuck ? Math.min(settings.musicVolume, settings.metronomeVolume * 0.8) : settings.musicVolume,
    musicTrack: selectedTrack,
    shouldPlayMetronome: running,
    shouldPlayMusic: running && musicEnabled && !!selectedTrack,
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

  const stopRun = () => {
    setRunning(false);
    setStarted(false);
    setElapsed(0);
    setDistanceKm(0);
  };

  const nextTrack = () => {
    const list = suggestedTracks.length > 0 ? suggestedTracks : rankedTracks;
    if (list.length === 0) return;
    const index = list.findIndex((entry) => entry.track.id === selectedTrackId);
    const next = list[(index + 1 + list.length) % list.length];
    setSelectedTrackId(next.track.id);
  };

  const currentFoot = Math.floor(elapsed * (cadence / 60)) % 2 === 0 ? 'Esquerda' : 'Direita';
  const currentScreen = (() => {
    switch (tab) {
      case 'correr':
        return (
          <RunScreen
            cadence={cadence}
            distanceKm={distanceKm}
            elapsed={elapsed}
            pace={effectivePace}
            running={running}
            started={started}
            currentFoot={currentFoot}
            onStart={startRun}
            onPause={() => setRunning(false)}
            onResume={() => setRunning(true)}
            onStop={stopRun}
            musicEnabled={musicEnabled}
            onToggleMusic={() => setMusicEnabled((current) => !current)}
            selectedTrack={selectedTrack}
            nextTrack={nextTrack}
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
            onChangeTolerance={(value) => updateSettings('tolerance', value)}
            tracks={rankedTracks}
            selectedTrackId={selectedTrackId}
            onSelectTrack={setSelectedTrackId}
          />
        );
      case 'config':
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
            onChangeCadence={(value) => setCadenceOverride(value)}
            onResetCadence={() => setCadenceOverride(null)}
            pace={effectivePace}
            speed={effectiveSpeed}
            stride={liveStride}
            selectedTrack={selectedTrack}
            onStartRun={startRun}
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
          <TabButton label="Correr" tab="correr" current={tab} icon="pulse-outline" onPress={setTab} />
          <TabButton label="Musicas" tab="musicas" current={tab} icon="musical-notes-outline" onPress={setTab} />
          <TabButton label="Config" tab="config" current={tab} icon="options-outline" onPress={setTab} />
        </View>
      </View>
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
  onChangeCadence: (value: number) => void;
  onResetCadence: () => void;
  pace: number;
  speed: number;
  stride: number;
  selectedTrack: Track | null;
  onStartRun: () => void;
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>RunBeat</Text>
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
              <Text style={styles.metricHint}>≈ {props.speed.toFixed(1)} km/h</Text>
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
              <Text style={styles.metricHint}>≈ {formatPace(props.pace)} /km</Text>
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
            <Text style={styles.metricHint}>auto {props.autoCadence} BPM</Text>
          </View>
        </View>
        <Gauge cadence={props.cadence} onChange={props.onChangeCadence} />
        <View style={styles.rowBetween}>
          <Stat label="Passada" value={`${props.stride.toFixed(2)} m`} />
          <Stat label="Pace" value={`${formatPace(props.pace)} /km`} />
          <Stat label="Status" value={getCadenceStatus(props.cadence)} />
        </View>
        <Pressable onPress={props.onResetCadence} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Voltar para cadencia automatica</Text>
        </Pressable>
      </Card>

      {props.selectedTrack ? (
        <Card>
          <Text style={styles.cardLabel}>Playlist sugerida no BPM</Text>
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
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  musicEnabled: boolean;
  onToggleMusic: () => void;
  selectedTrack: Track | null;
  nextTrack: () => void;
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
        <Pressable onPress={props.onStart} style={styles.primaryButton}>
          <Ionicons name="play" size={20} color="#0D1116" />
          <Text style={styles.primaryButtonText}>Iniciar</Text>
        </Pressable>
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

      {props.selectedTrack ? (
        <Card>
          <TrackRow track={props.selectedTrack} distance={0} active />
          <View style={styles.rowBetween}>
            <Pressable onPress={props.onToggleMusic} style={styles.compactButton}>
              <Ionicons name={props.musicEnabled ? 'pause' : 'play'} size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>{props.musicEnabled ? 'Pausar musica' : 'Tocar musica'}</Text>
            </Pressable>
            <Pressable onPress={props.nextTrack} style={styles.compactButton}>
              <Ionicons name="play-skip-forward" size={18} color="#F4F7FB" />
              <Text style={styles.compactButtonText}>Proxima faixa</Text>
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
  onChangeTolerance: (value: number) => void;
  tracks: Array<{ track: Track; distance: number }>;
  selectedTrackId: string;
  onSelectTrack: (value: string) => void;
}) {
  const filtered = props.tracks.filter((entry) => entry.distance <= props.tolerance);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Musicas por BPM</Text>
      <Text style={styles.subtitle}>RunBeat usa uma biblioteca local de faixas sinteticas para tocar junto com o metrônomo.</Text>

      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.cardLabel}>Cadencia alvo</Text>
          <Text style={[styles.metricValue, { color: '#C3FF3B' }]}>{props.cadence} BPM</Text>
        </View>
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
      </Card>

      <Card>
        <Text style={styles.cardLabel}>Compatíveis agora</Text>
        {filtered.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma faixa em ±{props.tolerance} BPM. Aumente a tolerância.</Text>
        ) : (
          filtered.map(({ track, distance }) => (
            <Pressable key={track.id} onPress={() => props.onSelectTrack(track.id)}>
              <TrackRow track={track} distance={distance} active={track.id === props.selectedTrackId} />
            </Pressable>
          ))
        )}
      </Card>

      <Card>
        <Text style={styles.cardLabel}>Todas as faixas</Text>
        {props.tracks.map(({ track, distance }) => (
          <Pressable key={track.id} onPress={() => props.onSelectTrack(track.id)}>
            <TrackRow track={track} distance={distance} active={track.id === props.selectedTrackId} />
          </Pressable>
        ))}
      </Card>
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
      <Text style={styles.title}>Configuracoes</Text>
      <Text style={styles.subtitle}>Ajuste perfil de corrida, som do metrônomo e volumes.</Text>

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
        <Text style={styles.metricHint}>Sugestão automática pela altura: {props.suggestedStride.toFixed(2)} m</Text>
        <Pressable onPress={props.onResetStride} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Usar sugestão automática</Text>
        </Pressable>
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
        <Text style={styles.cardLabel}>Volumes</Text>
        <VolumeRow
          label="Metronomo"
          value={props.settings.metronomeVolume}
          icon="pulse-outline"
          onChange={(value) => props.onChangeSettings('metronomeVolume', value)}
        />
        <VolumeRow
          label="Musica"
          value={props.settings.musicVolume}
          icon="musical-notes-outline"
          onChange={(value) => props.onChangeSettings('musicVolume', value)}
        />
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Bip sempre audível</Text>
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
  const markers = [150, 160, 170, 180, 190];
  return (
    <View style={styles.gauge}>
      <View style={styles.gaugeTrack}>
        <View style={styles.gaugeRecommended} />
        <View style={[styles.gaugeFill, { width: `${((cadence - 150) / 40) * 100}%` }]} />
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
  eyebrow: {
    color: '#C3FF3B',
    fontSize: 12,
    letterSpacing: 2.2,
    fontWeight: '800',
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
  trackTitle: {
    color: '#F4F7FB',
    fontSize: 15,
    fontWeight: '700',
  },
  trackArtist: {
    color: '#8A95A1',
    fontSize: 12,
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
});
