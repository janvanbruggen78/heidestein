// services/background.ts
// Minimal, "surgery mode" update: keep the public API identical,
// route native calls through utils/NativeTracking shims, and
// make Android-only behavior safe (no-ops elsewhere).

import { Platform } from 'react-native';
import {
  startNativeTracking,
  updateNativeTrackingOptions,
  stopNativeTracking,
} from '../utils/NativeTracking';

// -------------------------------------------
// Types & simple state (debug/telemetry only)
// -------------------------------------------
export type ForegroundStatus = 'tracking' | 'paused' | 'stopped';

type StartOpts = {
  intervalMs?: number;
  distanceM?: number;
};

type SwitchOpts = {
  intervalMs?: number;
  distanceM?: number;
};

const isAndroid = Platform.OS === 'android';
const withDefaults = <T extends { intervalMs?: number; distanceM?: number }>(opts?: T) => ({
  intervalMs: 3000,
  distanceM: 5,
  ...(opts || {}),
});

let _writer: 'fg' | 'bg' | null = null;
let _status: ForegroundStatus = 'stopped';
let _active: { trackId: string | null; segmentIndex: number | null } = {
  trackId: null,
  segmentIndex: null,
};

// -------------------------------------------
// Public API — keep exact names/signatures
// -------------------------------------------

/**
 * Who currently "owns" DB writes (foreground vs background).
 * (Your screens rely on this to coordinate; native layer doesn't need it.)
 */
export async function setWriter(w: 'fg' | 'bg') {
  _writer = w;
}

/**
 * Mirrors UI state to native service so the sticky notification
 * uses the right paused/tracking label immediately.
 */
export async function setForegroundStatus(status: ForegroundStatus) {
  _status = status;

  if (!isAndroid) return;
  const paused = status === 'paused';

  try {
    // Only toggle paused flag here; cadence changes happen via switchBackgroundProfile
    await updateNativeTrackingOptions({ paused });
  } catch (e) {
    // Keep UI responsive even if native module isn't ready yet
    // console.warn('[BG] setForegroundStatus failed (ignored)', e);
  }
}

/**
 * Start the Android foreground tracking service.
 * NOTE: DB writes and UI state are handled by your screen; this only manages native service.
 */
export async function startBackground(
  trackId: string,
  segmentIndex: number,
  status: 'tracking' | 'paused',
  opts?: StartOpts,
) {
  console.log('[BG] startBackground CALLED', { trackId, segmentIndex, status, opts });

  _active = { trackId, segmentIndex };
  _status = status;

  if (!isAndroid) return;

  const o = withDefaults(opts);
  const paused = status === 'paused';

  try {
    await startNativeTracking({
      title: 'Heidestein',
      intervalMs: o.intervalMs,
      distanceM: o.distanceM,
      paused,
    });
  } catch (e) {
    console.warn('[BG] startNativeTracking failed (ignored)', e);
  }
}

/**
 * Switch cadence/profile while running (e.g., tracking ↔ paused, interval tweaks).
 */
export async function switchBackgroundProfile(
  status: 'tracking' | 'paused',
  opts?: SwitchOpts,
) {
  console.log('[BG] switchBackgroundProfile CALLED', { status, opts });

  _status = status;

  if (!isAndroid) return;

  const o = withDefaults(opts);
  const paused = status === 'paused';

  try {
    await updateNativeTrackingOptions({
      intervalMs: o.intervalMs,
      distanceM: o.distanceM,
      paused,
    });
  } catch (e) {
    console.warn('[BG] updateNativeTrackingOptions failed (ignored)', e);
  }
}

/**
 * Stop the Android foreground tracking service.
 */
export async function stopBackground() {
  console.log('[BG] stopBackground CALLED');

  if (!isAndroid) {
    _status = 'stopped';
    _active = { trackId: null, segmentIndex: null };
    return;
  }

  try {
    await stopNativeTracking();
  } catch (e) {
    console.warn('[BG] stopNativeTracking failed (ignored)', e);
  } finally {
    _status = 'stopped';
    _active = { trackId: null, segmentIndex: null };
  }
}

/**
 * Your UI calls this when opening a new segment after resume.
 * Native service doesn't require this info, but we keep it for parity/logging.
 */
export async function setActiveMeta(trackId: string, segmentIndex: number) {
  _active = { trackId, segmentIndex };
  // Intentionally no native call — Kotlin service doesn't need it.
}

// -------------------------------------------
// Optional read-only getters (handy in debug)
// -------------------------------------------
export function getForegroundStatus(): ForegroundStatus {
  return _status;
}

export function getWriter(): 'fg' | 'bg' | null {
  return _writer;
}

export function getActiveMeta(): { trackId: string | null; segmentIndex: number | null } {
  return _active;
}
