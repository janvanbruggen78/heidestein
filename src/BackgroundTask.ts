// BackgroundTask.ts — Expo-only foreground service (no Notifee), single-writer guard

import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { appendPoint } from './db';

import { StickyNotification } from './utils/StickyNotification';

export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';
const ACTIVE_FILE = FileSystem.documentDirectory + 'active.json';

type Profile = 'tracking' | 'paused';
type Status = 'tracking' | 'paused';

type ActivePayload = {
  trackId: string;
  segmentIndex: number;
  mode?: Profile;            // tracking | paused
  writer?: 'fg' | 'bg';      // single-writer: foreground screen vs background task
};

const IS_WEB = Platform.OS === 'web';
const IS_ANDROID = Platform.OS === 'android';

// ------- small FS helpers -------
async function readActive(): Promise<ActivePayload | null> {
  try {
    const info = await FileSystem.getInfoAsync(ACTIVE_FILE);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(ACTIVE_FILE);
    return JSON.parse(raw) as ActivePayload;
  } catch {
    return null;
  }
}

async function patchActiveFile(patch: Partial<ActivePayload>) {
  try {
    const current =
    (await readActive()) ??
    ({ trackId: '', segmentIndex: 0, mode: 'tracking', writer: 'bg' } as ActivePayload);
    const next = { ...current, ...patch };
    await FileSystem.writeAsStringAsync(ACTIVE_FILE, JSON.stringify(next));
  } catch (e) {
    console.warn('[BG] patchActiveFile failed', e);
  }
}

// ------- public helpers called from UI -------
export async function setActiveMeta(trackId: string, segmentIndex: number) {
  await patchActiveFile({ trackId, segmentIndex });
}
export async function setWriter(writer: 'fg' | 'bg') {
  await patchActiveFile({ writer });
}
export async function setBgMode(mode: Profile) {
  await patchActiveFile({ mode });
}

// ------- UI strings -------
function statusText(s: Status) {
  switch (s) {
  case 'tracking': return 'Recording your movement in the background';
  case 'paused':   return 'Paused — keeping service alive';
  }
}

// ------- location profiles (Expo FS) -------
function profileOptions(p: Profile): Location.LocationTaskOptions {
  const paused = p === 'paused';
  return {
    accuracy: paused ? Location.Accuracy.Balanced : Location.Accuracy.High,
    timeInterval: paused ? 60000 : 2000,
    distanceInterval: paused ? 50 : 6,
    pausesUpdatesAutomatically: false,
    activityType: paused ? Location.ActivityType.Other : Location.ActivityType.Fitness,
    // @ts-expect-error: legacy typings for Android override
    accuracyAndroid: paused ? Location.Accuracy.Balanced : Location.Accuracy.High,
    foregroundServiceType: 'location', // important on Android 12+
    foregroundService: {
      notificationTitle: 'Route Tracker',
      notificationBody: statusText(paused ? 'paused' : 'tracking'),
      killServiceOnDestroy: true,
    },
  };
}

// ------- background task (Expo TaskManager) -------
if (!IS_WEB) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) { console.warn('[BG] error:', error); return null; }
    const { locations } = (data as any) || {};
    if (!locations?.length) return null;

    try {
      const active = await readActive();
      if (!active) return null;

      const { trackId, segmentIndex, mode, writer } = active;

      // Single-writer + paused guard
      if (mode === 'paused') return null;
      if (writer === 'fg') return null;

      for (const loc of locations) {
        const { latitude, longitude, accuracy, speed, altitude } = loc?.coords || {};
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          const ts = typeof loc?.timestamp === 'number' ? loc.timestamp : Date.now();
          await appendPoint(trackId, segmentIndex, { latitude, longitude, ts, accuracy, speed, altitude });
        }
      }
    } catch (e) {
      console.warn('[BG] write failed', e);
    }
    return null;
  });
}

// Android notification

export async function updateStickyFromUI(title: string, body: string) {
  if (Platform.OS !== 'android') return;
  try { await StickyNotification.update(title, body); } catch {}
}

// ------- public API (start/stop/switch/update) -------
export async function startBackground(
  trackId: string,
  segmentIndex: number,
  status: Status = 'tracking'
  ) {
  if (IS_WEB) return;

  // Persist meta first (so the task reads correct state on its very first tick)
  await patchActiveFile({
    trackId,
    segmentIndex,
    mode: status, // status is now either 'tracking' or 'paused'
  });

  const desiredProfile: Profile = status;
  const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);

  if (!running) {
    await Location.startLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
      profileOptions(desiredProfile)
      );
    if (Platform.OS === 'android') {
      try { await StickyNotification.show('Heidestein', statusText(status)); } catch {}
    }
  } else {
    // If already running, update options in-place
    try {
      // @ts-ignore API shape varies
      await Location.updateForegroundServiceOptionsAsync(
        BACKGROUND_LOCATION_TASK,
        profileOptions(desiredProfile)
        );
      if (Platform.OS === 'android') {
        try { await StickyNotification.update('Heidestein', statusText(status)); } catch {}
      }
    } catch {
      try {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        await Location.startLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK,
          profileOptions(desiredProfile)
          );
        if (Platform.OS === 'android') {
          try { await StickyNotification.show('Heidestein', statusText(status)); } catch {}
        }
      } catch (e2) {
        console.warn('[BG] restart updates failed', e2);
      }
    }
  }
}

let lastProfileSwitch = 0;
const SWITCH_DEBOUNCE_MS = 10_000;

export async function switchBackgroundProfile(profile: Profile) {
  if (IS_WEB) return;

  const now = Date.now();
  if (now - lastProfileSwitch < SWITCH_DEBOUNCE_MS) {
    // avoid flapping service options on finicky ROMs
    return;
  }
  lastProfileSwitch = now;

  await setBgMode(profile);

  try {
    // @ts-ignore
    await Location.updateForegroundServiceOptionsAsync(
      BACKGROUND_LOCATION_TASK,
      profileOptions(profile)
      );
    if (Platform.OS === 'android') {
      try {
        const body = profile === 'paused' ? statusText('paused') : statusText('tracking');
        await StickyNotification.update('Heidestein', body);
      } catch {}
    }
  } catch {
    try {
      const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, profileOptions(profile));
    } catch (e2) {
      console.warn('[BG] switch profile failed', e2);
    }
    if (Platform.OS === 'android') {
      try {
        const body = profile === 'paused' ? statusText('paused') : statusText('tracking');
        await StickyNotification.update('Heidestein', body);
      } catch {}
    }
  }
}

export async function setForegroundStatus(status: Status) {
  if (IS_WEB) return;

  const profile: Profile = status === 'paused' ? 'paused' : 'tracking';
  await setBgMode(profile);

  const opts = {
    ...profileOptions(profile),
    foregroundService: {
      notificationTitle: 'Route Tracker',
      notificationBody: statusText(status),
      killServiceOnDestroy: true,
    },
  } as Location.LocationTaskOptions;

  try {
    // Try to update the running foreground service in place
    // @ts-ignore
    await Location.updateForegroundServiceOptionsAsync(BACKGROUND_LOCATION_TASK, opts);
    if (Platform.OS === 'android') {
      try {
        const body = profile === 'paused' ? statusText('paused') : statusText('tracking');
        await StickyNotification.update('Heidestein', body);
      } catch {}
    }
  } catch (e) {
    // Some SDKs/ROMs ignore in-place updates → force a refresh by restarting updates
    try {
      const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, opts);
      if (Platform.OS === 'android') {
        try {
          const body = profile === 'paused' ? statusText('paused') : statusText('tracking');
          await StickyNotification.update('Heidestein', body);
        } catch {}
      }
    } catch (e2) {
      console.warn('[BG] setForegroundStatus hard refresh failed', e2);
    }
  }
}

export async function stopBackground() {
  if (IS_WEB) return;
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (Platform.OS === 'android') {
      try { await StickyNotification.hide(); } catch {}
    }
  } catch (e) {
    console.warn('[BG] stop updates failed (ignored)', e);
  }
  try {
    await FileSystem.deleteAsync(ACTIVE_FILE, { idempotent: true });
  } catch {}
}
