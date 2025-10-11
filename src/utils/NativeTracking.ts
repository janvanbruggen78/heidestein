import { NativeModules, Platform } from 'react-native';

type Status = 'tracking' | 'paused' | 'stopped';
type Payload = {
  trackId: string;
  status: Status;
  distanceMeters: number;
  durationMs: number;
  avgSpeedMps: number;
};

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
};

function getTrackingModule() {
  return (NativeModules as any).Tracking || null;
}

// tiny helper: wait a bit
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Updates the Android sticky notification with live stats.
 * Retries briefly if the native module isn't ready yet (post-reload).
 */
export async function updateNativeNotification(p: Payload) {
  if (Platform.OS !== 'android') return;

  // Retry up to ~1.5s for native module export to appear after a reload
  let mod = getTrackingModule();
  for (let i = 0; i < 3 && (!mod || Object.keys(mod).length === 0); i++) {
    await delay(500);
    mod = getTrackingModule();
  }
  // Debug surface (you already log this elsewhere)
  // console.log('[bridge] will call updateNativeNotification', Object.keys(mod || {}));

  if (!mod) return;

  if (typeof mod.updateNotificationStats === 'function') {
    return mod.updateNotificationStats(p);
  }

  // Fallback – old string-based method
  const title =
    p.status === 'paused' ? 'Heidestein · Paused'
    : p.status === 'tracking' ? 'Heidestein · Tracking'
    : 'Heidestein';
  const body = `${(p.distanceMeters / 1000).toFixed(2)} km • ${fmtDur(p.durationMs)}`;

  if (typeof mod.updateNotification === 'function') {
    return mod.updateNotification(title, body);
  }
}

/** Compatibility shims (map old helper names to current native methods) */
export function startNativeTracking(opts: { title?: string; intervalMs?: number; distanceM?: number; paused?: boolean; }) {
  const mod = getTrackingModule();
  if (!mod?.start) return Promise.reject(new TypeError('Native Tracking.start not available'));
  const safe: any = { ...opts };
  if (typeof safe.intervalMs === 'number') safe.intervalMs = Math.floor(safe.intervalMs);
  if (typeof safe.distanceM === 'number') safe.distanceM = Number(safe.distanceM);
  return mod.start(safe);
}
export function updateNativeTrackingOptions(opts: { title?: string; intervalMs?: number; distanceM?: number; paused?: boolean; }) {
  const mod = getTrackingModule();
  if (!mod?.updateOptions) return Promise.reject(new TypeError('Native Tracking.updateOptions not available'));
  const safe: any = { ...opts };
  if (typeof safe.intervalMs === 'number') safe.intervalMs = Math.floor(safe.intervalMs);
  if (typeof safe.distanceM === 'number') safe.distanceM = Number(safe.distanceM);
  return mod.updateOptions(safe);
}
export function stopNativeTracking() {
  const mod = getTrackingModule();
  if (!mod?.stop) return Promise.reject(new TypeError('Native Tracking.stop not available'));
  return mod.stop();
}
