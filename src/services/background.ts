import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { appendPoint, getTrackLabel } from '../db/db';
import {
  startNativeTracking,
  updateNativeOptions,
  stopNativeTracking,
  subscribeNativeLocations,
  updateNativeNotification,
  type NativeLoc,
} from '../utils/NativeTracking';

export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

// TODO -- Remove either Profile or Status
type Profile = 'tracking' | 'paused';
type Status  = 'tracking' | 'paused';

type ActivePayload = {
  trackId: string;
  opts?: { intervalMs?: number; distanceM?: number }
  segmentIndex: number;
  mode: Profile;
  writer: 'fg' | 'bg';
};

const IS_WEB = Platform.OS === 'web';
const IS_ANDROID = Platform.OS === 'android';
const ACTIVE_FILE = FileSystem.documentDirectory + 'active.json';

let memActive: ActivePayload = {
  trackId: '',
  segmentIndex: 0,
  mode: 'tracking',
  writer: 'bg',
};

const notif = {
  title: 'Heidestein',
  startMs: 0,
  lastPush: 0,
  lastBody: '',
  lastLat: null as number | null,
  lastLon: null as number | null,
  distM: 0,
};

let notifTick: ReturnType<typeof setInterval> | null = null;

function startNotifLoop() {
  if (notifTick) return;
  notifTick = setInterval(() => {
    // only Android uses the sticky notif; skip when paused
    if (Platform.OS !== 'android') return;
    if (memActive.mode === 'paused') return;

    const now = Date.now();
    const body = `${fmtKm(notif.distM)} • ${fmtDur(now - (notif.startMs || now))}`;
    // diff to avoid redundant notify() calls
    if (body !== notif.lastBody) {
      notif.lastBody = body;
      updateNativeNotification(notif.title, body).catch(() => {});
    }
  }, 2000);
}

function stopNotifLoop() {
  if (notifTick) { clearInterval(notifTick); notifTick = null; }
}

async function readActive(): Promise<ActivePayload | null> {
  try {
    const info = await FileSystem.getInfoAsync(ACTIVE_FILE);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(ACTIVE_FILE);
    const parsed = JSON.parse(raw) as Partial<ActivePayload>;
    // ensure defaults
    return {
      trackId: parsed.trackId ?? '',
      segmentIndex: parsed.segmentIndex ?? 0,
      mode: (parsed.mode ?? 'tracking') as Profile,
      writer: (parsed.writer ?? 'bg') as 'fg' | 'bg',
    };
  } catch {
    return null;
  }
}

async function patchActiveFile(patch: Partial<ActivePayload>) {
  try {
    const current = (await readActive()) ?? memActive;
    memActive = { ...current, ...patch };
    await FileSystem.writeAsStringAsync(ACTIVE_FILE, JSON.stringify(memActive));
  } catch (e) {
    console.warn('[BG] patchActiveFile failed', e);
  }
}

export async function setActiveMeta(trackId: string, segmentIndex: number) {
  await patchActiveFile({ trackId, segmentIndex });
}
export async function setWriter(writer: 'fg' | 'bg') {
  await patchActiveFile({ writer });
}
export async function setBgMode(mode: Profile) {
  await patchActiveFile({ mode });
}

// -------------------- Display text helpers --------------------
function statusText(s: Status) {
  return s === 'paused'
  ? 'Paused — keeping service alive'
  : 'Recording your movement in the background';
}

/** UI can push distance • duration to the (single) notification */
export async function updateForegroundText(title: string, body: string) {
  if (IS_ANDROID) {
    await updateNativeOptions({ title, body });
    return;
  }
}

// -------------------- Profiles --------------------
function profileOptions(p: Profile): Location.LocationTaskOptions {
  const paused = p === 'paused';
  return {
    accuracy: paused ? Location.Accuracy.Balanced : Location.Accuracy.High,
    timeInterval: paused ? 60000 : 5000,          // ms
    distanceInterval: paused ? 50 : 6,            // meters
    pausesUpdatesAutomatically: false,
    activityType: paused ? Location.ActivityType.Other : Location.ActivityType.Fitness,
    // @ts-expect-error: legacy typings for Android override
    accuracyAndroid: paused ? Location.Accuracy.Balanced : Location.Accuracy.High,
    foregroundServiceType: 'location',
    foregroundService: {
      notificationTitle: 'Heidestein',
      notificationBody: statusText(paused ? 'paused' : 'tracking'),
      killServiceOnDestroy: true,
    },
  };
}

let nativeUnsub: (() => void) | null = null;

function ensureAndroidListener() {
  if (Platform.OS !== 'android') return;
  if (nativeUnsub) return;

  nativeUnsub = subscribeNativeLocations(async (loc) => {
    const { latitude, longitude, accuracy, speed, altitude, ts } = loc || {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return;

    if (memActive.mode !== 'paused' && memActive.writer !== 'fg') {
      try {
        await appendPoint(memActive.trackId, memActive.segmentIndex, {
          latitude,
          longitude,
          ts: typeof ts === 'number' ? ts : Date.now(),
          accuracy: typeof accuracy === 'number' ? accuracy : null,
          speed: typeof speed === 'number' ? speed : null,
          altitude: typeof altitude === 'number' ? altitude : null,
        });
      } catch (e) {
        console.warn('[BG] appendPoint failed', e);
      }
    }
  });
}


if (!IS_WEB && !IS_ANDROID) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) { console.warn('[BG] TM error:', error); return null; }
    const { locations } = (data as any) || {};
    if (!locations?.length) return null;
    if (memActive.mode === 'paused' || memActive.writer === 'fg') return null;

    try {
      for (const loc of locations) {
        const { latitude, longitude, accuracy, speed, altitude } = loc?.coords || {};
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          const ts = typeof loc?.timestamp === 'number' ? loc.timestamp : Date.now();
          await appendPoint(memActive.trackId, memActive.segmentIndex, {
            latitude, longitude, ts,
            accuracy: typeof accuracy === 'number' ? accuracy : null,
            speed: typeof speed === 'number' ? speed : null,
            altitude: typeof altitude === 'number' ? altitude : null,
          });
        }
      }
    } catch (e) {
      console.warn('[BG] appendPoint (iOS TM) failed', e);
    }
    return null;
  });
}

let __fgOp: Promise<any> = Promise.resolve();
function runFgOp<T>(fn: () => Promise<T>): Promise<T> {
  const chained = __fgOp.then(fn, fn);
  __fgOp = chained.then(() => undefined, () => undefined);
  return chained;
}

// -------------------- Public API --------------------
export async function startBackground(
  trackId: string,
  segmentIndex: number,
  status: 'tracking' | 'paused' = 'tracking'
  ) {
  await patchActiveFile({ trackId, segmentIndex, mode: status });

  if (Platform.OS === 'android') {
    ensureAndroidListener();

    // Seed title from label (fallback to id)
    const label = (await getTrackLabel(trackId).catch(() => null))?.trim();
    const title = (label && label.length ? label : trackId) || 'Heidestein';

    const interval = opts?.intervalMs ?? 5000;
    const distance = opts?.distanceM ?? 6;

    await startNativeTracking({
      title,
      intervalMs: status === 'paused' ? 60000 : interval,
      distanceM: status === 'paused' ? 50 : distance,
      paused: status === 'paused',
    });

    return;
  }

  const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  const opts = profileOptions(status);
  if (!running) {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, opts);
  } else {
    try {
      // @ts-ignore
      await Location.updateForegroundServiceOptionsAsync(BACKGROUND_LOCATION_TASK, opts);
    } catch {
      try {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, opts);
      } catch (e2) {
        console.warn('[BG] iOS restart updates failed', e2);
      }
    }
  }
}

let lastProfileSwitch = 0;
const SWITCH_DEBOUNCE_MS = 10_000;

/** Switch between 'tracking' and 'paused'. */
export async function switchBackgroundProfile(
  profile: 'tracking' | 'paused',
  opts?: { intervalMs?: number; distanceM?: number }
  ) {
  await patchActiveFile({ mode: profile });

  if (Platform.OS === 'android') {
    const paused = profile === 'paused';
    const interval = opts?.intervalMs ?? 5000;
    const distance = opts?.distanceM ?? 6;
    
    await updateNativeOptions({
      intervalMs: profile === 'paused' ? 60000 : interval,
      distanceM:  profile === 'paused' ? 50    : distance,
      paused,
    });
    return;
  }

  const now = Date.now();
  if (profile === 'tracking') {
    if (now - lastProfileSwitch < SWITCH_DEBOUNCE_MS) return;
    lastProfileSwitch = now;
  }

  await runFgOp(async () => {
    // @ts-ignore
    await Location.updateForegroundServiceOptionsAsync(
      BACKGROUND_LOCATION_TASK,
      profileOptions(profile)
      );
  }).catch(async () => {
    try {
      const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, profileOptions(profile));
    } catch (e2) {
      console.warn('[BG] iOS switch profile failed', e2);
    }
  });
}

export async function setForegroundStatus(status: 'tracking' | 'paused') {
  await setBgMode(status);

  if (Platform.OS === 'android') {
    return;
  }

  const opts = {
    ...profileOptions(status),
    foregroundService: {
      notificationTitle: 'Heidestein',
      notificationBody: status === 'paused'
      ? 'Paused — keeping service alive'
      : 'Recording your movement in the background',
      killServiceOnDestroy: true,
    },
  } as Location.LocationTaskOptions;

  try {
    // @ts-ignore
    await Location.updateForegroundServiceOptionsAsync(BACKGROUND_LOCATION_TASK, opts);
  } catch (e) {
    try {
      const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, opts);
    } catch (e2) {
      console.warn('[BG] iOS setForegroundStatus refresh failed', e2);
    }
  }
}

function fmtKm(m: number) { 
  return `${(m / 1000).toFixed(2)} km`; 
}

function fmtDur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export async function stopBackground(opts?: { clearActive?: boolean }) {
  const clearActive = opts?.clearActive ?? true;
  console.log('[BG] stopBackground CALLED', opts);

  if (Platform.OS === 'android') {
    try { await stopNativeTracking(); } catch (e) {
      console.warn('[BG] stopNativeTracking failed (ignored)', e);
    }
    if (nativeUnsub) { nativeUnsub(); nativeUnsub = null; }
  } else {
    try {
      const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch (e) {
      console.warn('[BG] stop updates failed (ignored)', e);
    }
  }

  if (clearActive) {
    try { await FileSystem.deleteAsync(ACTIVE_FILE, { idempotent: true }); } catch {}
  }
}
