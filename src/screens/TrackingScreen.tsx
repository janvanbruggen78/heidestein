// TrackingScreen.tsx — accuracy-gated warm-up only (no UI-only rejections)
// Distance is now DERIVED from all segments (no setDistance)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Platform, Image, InteractionManager, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useKeepAwake } from 'expo-keep-awake';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/AppNavigator';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import RouteCanvas from '../components/RouteCanvas';
import { formatDistance, formatDuration, formatSpeed } from '../utils/format';
import {
  appendPoint,
  createTrack,
  finalizeTrack,
  haversine,
  newSegmentIndex,
  loadTrackPoints,
  getTrackMeta,
} from '../db';
import { useSettings } from '../settings/SettingsContext';
import {
  startBackground,
  stopBackground,
  switchBackgroundProfile,
  setForegroundStatus,
  setActiveMeta,
  setWriter,
} from '../BackgroundTask';

import styles from '../styles';

// ---------------------------
// Warm-up tuning (shared idea)
// ---------------------------
const SEED_ACC_MAX = 35;        // need ≤35m accuracy twice in a row to seed
const WARM_COUNT_ACC_MAX = 45;  // only count warm-up on accuracy ≤45m
const WARM_ACCEPTS = 12;        // length of warm-up (accepted updates)
const USE_SPEED_FOR_WARMUP = true; // require reported speed > 0 to count warm-up

// ---------------------------
// Types
// ---------------------------
type LatLng = { latitude: number; longitude: number };
type LatLngTs = LatLng & { ts: number };

const ACTIVE_KEY = 'active_run_v2';

// Local-plane helpers
function metersPerDeg(latDeg: number) {
  const lat = (latDeg * Math.PI) / 180;
  const mLat = 111132.92 - 559.82 * Math.cos(2*lat) + 1.175 * Math.cos(4*lat);
  const mLon = 111412.84 * Math.cos(lat) - 93.5 * Math.cos(3*lat);
  return { mLat, mLon };
}

function ensureNotificationPermission() {
  if (Platform.OS !== 'android') return Promise.resolve(true);
  return Notifications.getPermissionsAsync().then(s => s.granted || Notifications.requestPermissionsAsync().then(r => r.granted ?? false));
}
async function ensureBgPreciseOrPrompt(): Promise<{ ok: boolean; fg: Location.PermissionStatus; bg?: Location.PermissionStatus }> {
  let fgPerm = await Location.getForegroundPermissionsAsync();
  if (fgPerm.status !== 'granted') {
    fgPerm = await Location.requestForegroundPermissionsAsync();
    if (fgPerm.status !== 'granted') return { ok: false, fg: fgPerm.status };
  }
  if (Platform.OS === 'android') {
    let bgPerm = await Location.getBackgroundPermissionsAsync();
    if (bgPerm.status !== 'granted') bgPerm = await Location.requestBackgroundPermissionsAsync();
    // if (bgPerm.status !== 'granted') {
    //   Alert.alert(
    //     'Allow background location',
    //     'To keep tracking with the screen off, open App settings → Permissions → Location and choose “Allow all the time”. Also enable “Use precise location”.',
    //     [{ text: 'Cancel', style: 'cancel' }, { text: 'Open settings', onPress: () => Linking.openSettings() }]
    //     );
    //   return { ok: false, fg: fgPerm.status, bg: bgPerm.status };
    // }
    return { ok: true, fg: fgPerm.status, bg: bgPerm.status };
  }
  return { ok: true, fg: fgPerm.status };
}

export default function TrackingScreen() {
  useKeepAwake();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { intervalMs = 3000, theme, unitSystem } = useSettings();
  const insets = useSafeAreaInsets();

  // Canvas remount
  const [canvasEpoch, setCanvasEpoch] = useState(0);

  // Map focusing
  const [focusPoint, setFocusPoint] = useState<LatLng | null>(null);

  // State
  const [tracking, setTracking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mockMode, setMockMode] = useState(false);

  // Segments (ts = source of truth)
  const [segmentsTs, setSegmentsTs] = useState<LatLngTs[][]>([[]]);
  const segmentsForCanvas = useMemo<LatLng[][]>(
    () => segmentsTs.map(seg => seg.map(({ latitude, longitude }) => ({ latitude, longitude }))),
    [segmentsTs]
    );

  // [DISTANCE] derive TOTAL distance from all segments (no setDistance)
  const distance = useMemo(() => {
    let total = 0;
    for (const seg of segmentsTs) {
      for (let i = 1; i < seg.length; i++) {
        total += haversine(seg[i - 1], seg[i]);
      }
    }
    return total;
  }, [segmentsTs]);

  const [speed, setSpeed] = useState<number | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(0);

  // Refs
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const mockTimerRef = useRef<NodeJS.Timer | null>(null);

  const trackIdRef = useRef<string | null>(null);
  const segIndexRef = useRef(0);
  useEffect(() => { trackIdRef.current = trackId; }, [trackId]);
  useEffect(() => { segIndexRef.current = segmentIndex; }, [segmentIndex]);

  const pressGuardRef = useRef(false);
  const suppressNextDistanceRef = useRef(false); // kept for symmetry, now a no-op

  // Visual duration tick
  const [uiSecondTick, setUiSecondTick] = useState(0);
  useFocusEffect(
    React.useCallback(() => {
      if (!tracking || paused) return;
      const id = setInterval(() => setUiSecondTick(t => t + 1), 1000);
      return () => clearInterval(id);
    }, [tracking, paused])
    );

  // Writer ownership
  useFocusEffect(
    React.useCallback(() => {
      setWriter?.('fg').catch?.(() => {});
      return () => { setWriter?.('bg').catch?.(() => {}); };
    }, [])
    );

  // Permissions on mount
  useEffect(() => {
    (async () => {
      const notifOk = await ensureNotificationPermission();
      if (!notifOk) Alert.alert('Notifications disabled', 'Please allow notifications to keep background tracking visible and active.');
      await ensureBgPreciseOrPrompt();
    })();
  }, []);

  // ---------------------------
  // PREWARM (no DB writes)
  // ---------------------------
  const PREWARM_TIMEOUT_MS = 45_000;
  const PREWARM_GOOD_ACC = 25;
  const [prewarmFix, setPrewarmFix] = useState<{ lat: number; lon: number; acc?: number } | null>(null);
  const prewarmSubRef = useRef<Location.LocationSubscription | null>(null);
  const prewarmTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stopPrewarm = useCallback(() => {
    try { prewarmSubRef.current?.remove?.(); } catch {}
    prewarmSubRef.current = null;
    if (prewarmTimerRef.current) { clearTimeout(prewarmTimerRef.current as any); prewarmTimerRef.current = null; }
  }, []);
  const startPrewarm = useCallback(async () => {
    if (prewarmSubRef.current || tracking) return;
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last?.coords) {
        setPrewarmFix({ lat: last.coords.latitude, lon: last.coords.longitude, acc: last.coords.accuracy ?? undefined });
        if (typeof last.coords.accuracy === 'number' && last.coords.accuracy <= PREWARM_GOOD_ACC) return;
      }
    } catch {}
    try {
      prewarmSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          const { latitude, longitude, accuracy } = loc.coords;
          setPrewarmFix({ lat: latitude, lon: longitude, acc: accuracy ?? undefined });
          if (typeof accuracy === 'number' && accuracy <= PREWARM_GOOD_ACC) stopPrewarm();
        }
        );
      prewarmTimerRef.current = setTimeout(stopPrewarm, PREWARM_TIMEOUT_MS) as any;
    } catch {}
  }, [tracking, stopPrewarm]);
  useFocusEffect(useCallback(() => { if (!tracking) startPrewarm(); return () => stopPrewarm(); }, [tracking, startPrewarm, stopPrewarm]));

  // ---------------------------
  // Warm-up state (UI)
  // ---------------------------
  const originRef = useRef<{ lat: number; lon: number; mLat: number; mLon: number } | null>(null);
  const seededRef = useRef(false);
  const seedGoodStreakRef = useRef(0);
  const warmRemainingRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);

  function ensureOrigin(lat: number, lon: number) {
    if (!originRef.current) {
      const { mLat, mLon } = metersPerDeg(lat);
      originRef.current = { lat, lon, mLat, mLon };
    }
  }
  function resetWarmUi() {
    originRef.current = null;
    seededRef.current = false;
    seedGoodStreakRef.current = 0;
    warmRemainingRef.current = 0;
    lastTsRef.current = null;
  }

  // Append point (UI + DB) — parity with BG; no UI-only reject
  const appendPointBoth = useCallback(async (pt: LatLngTs, meta?: { reportedSpeed?: number | null; accuracy?: number | null }) => {
    // UI
    setSegmentsTs(prev => {
      const copy = prev.map(s => [...s]);
      const seg = copy[copy.length - 1];
      // [DISTANCE] no manual setDistance increment, derived from segments
      seg.push(pt);
      return copy;
    });
    if (typeof meta?.reportedSpeed === 'number') setSpeed(meta.reportedSpeed);
    else setSpeed(null);

    // DB
    const id = trackIdRef.current;
    const segIdx = segIndexRef.current;
    if (id != null) {
      try { await appendPoint(id, segIdx, pt as any); }
      catch (e) { console.warn('[DBG] failed', { id, segIdx, pt }, e); }
    }
  }, []);

  // Duration (visual only)
  const durationMs = useMemo(() => {
    let sum = 0;
    const n = segmentsTs.length;
    for (let i = 0; i < n; i++) {
      const seg = segmentsTs[i];
      if (seg.length < 1) continue;
      const first = seg[0].ts;
      const isLast = i === n - 1;
      if (isLast && tracking && !paused) {
        const now = Date.now();
        if (now > first) sum += (now - first);
      } else if (seg.length >= 2) {
        const last = seg[seg.length - 1].ts;
        if (last > first) sum += (last - first);
      }
    }
    return sum;
  }, [segmentsTs, tracking, paused, uiSecondTick]);

  const kmh = (dist: number, dur: number) => (dur > 0 ? (dist / dur) * 3.6 * 1000 : 0);
  const avgSpeed = useMemo(() => Math.max(0, Math.min(20, kmh(distance, durationMs))), [distance, durationMs]);

  // Restore
  const restoreActive = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem(ACTIVE_KEY);
      if (!s) return;

      const payload = JSON.parse(s) as { id: string; seg: number; autoResume?: boolean; resumeHint?: 'new-segment' };
      const { id, seg, autoResume = true, resumeHint } = payload;

      const meta = await getTrackMeta(id);
      const loaded: any[][] = await loadTrackPoints(id);

      setTrackId(id);            trackIdRef.current = id;
      setSegmentIndex(seg);    segIndexRef.current = seg;
      setSegmentsTs(loaded.length ? (loaded as any) : [[]]);
      // [DISTANCE] no setDistance(meta?.distance ?? 0); derived from segments
      setTracking(true);
      setPaused(!autoResume);

      const needEmpty = autoResume && (seg >= loaded.length || resumeHint === 'new-segment');
      if (needEmpty) setSegmentsTs(prev => [...prev, []]);

      const lastSeg = loaded[loaded.length - 1] || [];
      const lastPt = lastSeg[lastSeg.length - 1];
      if (lastPt) setFocusPoint({ latitude: lastPt.latitude, longitude: lastPt.longitude });
      setCanvasEpoch(k => k + 1);

      await new Promise(r => setTimeout(r, 0));
      await InteractionManager.runAfterInteractions(() => Promise.resolve());

      // reset warm-up (UI)
      resetWarmUi();

      if (autoResume) {
        await startBackground(id, seg, 'tracking');
        await setForegroundStatus('tracking');

        // watcher
        try { watcherRef.current?.remove?.(); } catch {}
        watcherRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: Math.max(1000, intervalMs) },
          (loc) => {
            const { latitude, longitude, speed: v, accuracy: acc } = loc.coords;
            const ts = typeof loc.timestamp === 'number' ? loc.timestamp : Date.now();
            const accNum = typeof acc === 'number' ? acc : Infinity;
            const hasSpeed = typeof v === 'number' && v > 0;

            // ---- Accuracy-gated SEEDING ----
            if (!seededRef.current) {
              if (accNum <= SEED_ACC_MAX) {
                seedGoodStreakRef.current += 1;
                if (seedGoodStreakRef.current >= 2) {
                  ensureOrigin(latitude, longitude);
                  seededRef.current = true;
                  warmRemainingRef.current = WARM_ACCEPTS;
                  lastTsRef.current = ts;
                  // First point through UI+DB
                  const p0: LatLngTs = { latitude, longitude, ts };
                  appendPointBoth(p0, { reportedSpeed: v ?? null, accuracy: acc ?? null });
                }
              } else {
                seedGoodStreakRef.current = 0;
              }
              return;
            }

            // After seeding: just forward (no normal rejection)
            lastTsRef.current = ts;
            const p: LatLngTs = { latitude, longitude, ts };
            appendPointBoth(p, { reportedSpeed: v ?? null, accuracy: acc ?? null });

            // Warm-up countdown (accuracy + optional speed present)
            if (warmRemainingRef.current > 0) {
              const okAcc = accNum <= WARM_COUNT_ACC_MAX;
              const okSpd = USE_SPEED_FOR_WARMUP ? hasSpeed : true;
              if (okAcc && okSpd) warmRemainingRef.current -= 1;
            }
          }
          );

        setWriter?.('fg').catch?.(() => {});
      } else {
        await startBackground(id, seg, 'paused');
        await setForegroundStatus('paused');
        try { watcherRef.current?.remove?.(); } catch {}
        watcherRef.current = null;
        setWriter?.('bg').catch?.(() => {});
      }
    } catch (e) {
      console.warn('Could not restore active track:', e);
      await AsyncStorage.removeItem(ACTIVE_KEY);
    }
  }, [appendPointBoth, intervalMs]);

  useEffect(() => { void restoreActive(); }, [restoreActive]);
  useFocusEffect(useCallback(() => { void restoreActive(); }, [restoreActive]));

  // Start / Pause / Resume / Stop
  const startTrackingHandler = useCallback(async () => {
    // Double check on Background to aggresively avoid duplicates
    await stopBackground().catch(() => {});
    if (pressGuardRef.current) return;
    pressGuardRef.current = true;
    try {
      stopPrewarm(); setPrewarmFix(null);

      const res = await ensureBgPreciseOrPrompt();
      if (!res.ok) return;

      // reset warm-up
      resetWarmUi();

      const id = await createTrack();
      console.log(id);
      setTrackId(id); 
      trackIdRef.current = id;

      const segIdx = await newSegmentIndex(id);
      console.log(segIdx);
      setSegmentIndex(segIdx); 
      segIndexRef.current = segIdx;

      setSegmentsTs([[]]);
      // [DISTANCE] no setDistance(0); derived from empty segments
      setTracking(true);
      setPaused(false);
      setFocusPoint(null);
      setCanvasEpoch(k => k + 1);

      await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, seg: segIdx, autoResume: true }));

      // watcher
      try { watcherRef.current?.remove?.(); } catch {}
      watcherRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: Math.max(1000, intervalMs) },
        (loc) => {
          const { latitude, longitude, speed: v, accuracy: acc } = loc.coords;
          const ts = typeof loc.timestamp === 'number' ? loc.timestamp : Date.now();
          const accNum = typeof acc === 'number' ? acc : Infinity;
          const hasSpeed = typeof v === 'number' && v > 0;

          // Seeding
          if (!seededRef.current) {
            if (accNum <= SEED_ACC_MAX) {
              seedGoodStreakRef.current += 1;
              if (seedGoodStreakRef.current >= 2) {
                ensureOrigin(latitude, longitude);
                seededRef.current = true;
                warmRemainingRef.current = WARM_ACCEPTS;
                lastTsRef.current = ts;
                const p0: LatLngTs = { latitude, longitude, ts };
                appendPointBoth(p0, { reportedSpeed: v ?? null, accuracy: acc ?? null });
              }
            } else {
              seedGoodStreakRef.current = 0;
            }
            return;
          }

          // After seeding: forward all points
          lastTsRef.current = ts;
          const p: LatLngTs = { latitude, longitude, ts };
          appendPointBoth(p, { reportedSpeed: v ?? null, accuracy: acc ?? null });

          // Warm-up countdown
          if (warmRemainingRef.current > 0) {
            const okAcc = accNum <= WARM_COUNT_ACC_MAX;
            const okSpd = USE_SPEED_FOR_WARMUP ? hasSpeed : true;
            if (okAcc && okSpd) warmRemainingRef.current -= 1;
          }
        }
        );

      await startBackground(id, segIdx, 'tracking');
      await setForegroundStatus('tracking');
      setWriter?.('fg').catch?.(() => {});
    } finally {
      setTimeout(() => (pressGuardRef.current = false), 300);
    }
  }, [appendPointBoth, intervalMs, stopPrewarm]);

  const pauseHandler = useCallback(async () => {
    console.log(tracking);
    console.log(paused);
    if (pressGuardRef.current) return;
    console.log('hi')
    if (!tracking || paused) return;
    console.log('hi')

    pressGuardRef.current = true;
    try {
      await switchBackgroundProfile('paused');
      await setForegroundStatus('paused');
      await AsyncStorage.mergeItem(ACTIVE_KEY, JSON.stringify({ autoResume: false }));

      setSpeed(null);
      setPaused(true);
      try { watcherRef.current?.remove?.(); } catch {}
      watcherRef.current = null;
      if (mockTimerRef.current) { clearInterval(mockTimerRef.current as any); mockTimerRef.current = null; }
      setWriter?.('bg').catch?.(() => {});
    } catch(e) {
      console.log(e);
    }
    pressGuardRef.current = false;
  }, [paused, tracking]);

  const resumeHandler = useCallback(async () => {
    if (pressGuardRef.current) return;
    const id = trackIdRef.current;
    if (!tracking || !paused || !id) return;

    pressGuardRef.current = true;
    setPaused(false);
    setFocusPoint(null);

    const segIdx = await newSegmentIndex(id);
    setSegmentIndex(segIdx); segIndexRef.current = segIdx;

    await setActiveMeta(id, segIdx);
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, seg: segIdx, autoResume: true }));
    setWriter?.('fg').catch?.(() => {});

    setSegmentsTs(prev => [...prev, []]);
    suppressNextDistanceRef.current = true; // [DISTANCE] harmless now

    // reset warm-up
    // resetWarmUi();

    // watcher
    try { watcherRef.current?.remove?.(); } catch {}
    watcherRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: Math.max(1000, intervalMs) },
      (loc) => {
        const { latitude, longitude, speed: v, accuracy: acc } = loc.coords;
        const ts = typeof loc.timestamp === 'number' ? loc.timestamp : Date.now();
        const accNum = typeof acc === 'number' ? acc : Infinity;
        const hasSpeed = typeof v === 'number' && v > 0;

        if (!seededRef.current) {
          if (accNum <= SEED_ACC_MAX) {
            seedGoodStreakRef.current += 1;
            if (seedGoodStreakRef.current >= 2) {
              ensureOrigin(latitude, longitude);
              seededRef.current = true;
              warmRemainingRef.current = WARM_ACCEPTS;
              lastTsRef.current = ts;
              const p0: LatLngTs = { latitude, longitude, ts };
              appendPointBoth(p0, { reportedSpeed: v ?? null, accuracy: acc ?? null });
            }
          } else {
            seedGoodStreakRef.current = 0;
          }
          return;
        }

        lastTsRef.current = ts;
        const p: LatLngTs = { latitude, longitude, ts };
        appendPointBoth(p, { reportedSpeed: v ?? null, accuracy: acc ?? null });

        if (warmRemainingRef.current > 0) {
          const okAcc = accNum <= WARM_COUNT_ACC_MAX;
          const okSpd = USE_SPEED_FOR_WARMUP ? hasSpeed : true;
          if (okAcc && okSpd) warmRemainingRef.current -= 1;
        }
      }
      );
    pressGuardRef.current = false;
    await setForegroundStatus('tracking');
  }, [appendPointBoth, intervalMs, tracking, paused]);

  const stopHandler = useCallback(async () => {
    if (pressGuardRef.current) return;
    pressGuardRef.current = true;
    try {
      try { watcherRef.current?.remove?.(); } catch {}
      watcherRef.current = null;
      if (mockTimerRef.current) { clearInterval(mockTimerRef.current as any); mockTimerRef.current = null; }
      await stopBackground().catch(() => {});
      setWriter?.('bg').catch?.(() => {});

      const id = trackIdRef.current;
      const dist = distance; // [DISTANCE] derived total

      setTracking(false);
      setPaused(false);

      if (id) await finalizeTrack(id, dist);

      setSegmentsTs([[]]);
      // [DISTANCE] no setDistance(0); derived from segments
      setSpeed(null);
      setCanvasEpoch(k => k + 1);
      await AsyncStorage.removeItem(ACTIVE_KEY);

      setTrackId(null);
      trackIdRef.current = null;

      resetWarmUi();
      setPrewarmFix(null);
    } finally {
      pressGuardRef.current = false;
    }
  }, [distance]);

  // [DISTANCE] Removed DB sync tick that polled getTrackMeta and setDistance

  // Prewarm focus
  const pendingPrewarmFocus: LatLng | null = useMemo(
    () => (prewarmFix ? { latitude: prewarmFix.lat, longitude: prewarmFix.lon } : null),
    [prewarmFix]
    );

  // UI
  return (
    <SafeAreaView style={[{ flex: 1 }, theme === 'dark' ? styles.darkBg : styles.lightBg]} edges={['top', 'bottom']}>
      <View style={{ flex: 1 }}>
        {/* Logo */}
        <View style={[styles.logoRow(theme), { paddingTop: insets.top }]}>
          <Image source={require('../assets/logo.png')} style={[styles.logo, { textAlign: 'center' }]} resizeMode="contain" />
        </View>

        <View style={styles.headerRow(theme)}>
          <Text style={[styles.title(theme), { flex: 1, textAlign: 'center' }]}>HEIDESTEIN</Text>
        </View>

        <View style={styles.headerRow(theme)}>
          <SecondaryButton label="Archive" onPress={() => navigation.navigate('Archive')} />
            <SettingsButton label="Settings" onPress={() => navigation.navigate('Settings')} />
            </View>

            <View style={styles.metrics(theme)}>
              <Metric label="Distance" value={formatDistance(distance, unitSystem)} />
              <Metric label="Duration" value={formatDuration(durationMs)} />
              <Metric label="Avg Speed" value={formatSpeed(distance / (durationMs / 1000), unitSystem)} />
              <Metric label="Speed" value={formatSpeed(speed, unitSystem)} />
            </View>

            <View style={{ flex: 1, width: '100%' }}>
              <RouteCanvas
                key={canvasEpoch}
                segments={segmentsForCanvas}
                distance={distance}
                focusPoint={focusPoint || (!tracking ? pendingPrewarmFocus : null)}
                style={{ flex: 1 }}
                onFocusConsumed={() => setFocusPoint(null)}
              />
            </View>

            <View style={styles.controls(theme)}>
              <View style={styles.row}>
                {Platform.OS === 'web' && (
                  <SecondaryButton label={`Mock: ${mockMode ? 'On' : 'Off'}`} onPress={() => setMockMode(v => !v)} />
                  )}
                <SecondaryButton label="Stop" onPress={stopHandler} disabled={!tracking} />
                {!tracking ? (
                  <PrimaryButton label="Start" onPress={startTrackingHandler} />
                  ) : !paused ? (
                  <SecondaryButton label="Pause" onPress={pauseHandler} />
                  ) : (
                  <PrimaryButton label="Resume" onPress={resumeHandler} />
                  )}
                </View>
              </View>
            </View>
          </SafeAreaView>
          );
}

// Presentational
function Metric({ label, value }: { label: string; value: string }) {
  const { theme } = useSettings();
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel(theme)}>{label}</Text>
      <Text style={styles.metricValue(theme)}>{value}</Text>
    </View>
    );
}
function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={onPress}>
      <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{label}</Text>
    </TouchableOpacity>
    );
}
function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.button, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.buttonText}>{label}</Text>
    </TouchableOpacity>
    );
}
function SettingsButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { theme } = useSettings();
  return (
    <TouchableOpacity style={[styles.button, styles.settingsButton(theme)]} onPress={onPress} disabled={disabled}>
      <Text style={styles.settingsButton(theme)}>{label}</Text>
    </TouchableOpacity>
    );
}
