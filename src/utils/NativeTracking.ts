import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const Native = NativeModules.Tracking;

export type StartOpts = {
  title: string;
  body: string;
  intervalMs: number;  // e.g., 5000
  distanceM: number;   // e.g., 6
};

export function startNativeTracking(opts: StartOpts) {
  if (Platform.OS !== 'android') return Promise.resolve();
  return Native?.start?.(opts);
}

export function updateNativeOptions(opts: Partial<StartOpts>) {
  if (Platform.OS !== 'android') return Promise.resolve();
  return Native?.updateOptions?.(opts);
}

export function stopNativeTracking() {
  if (Platform.OS !== 'android') return Promise.resolve();
  return Native?.stop?.();
}

export type NativeLoc = {
  latitude: number; longitude: number; accuracy?: number;
  speed?: number; altitude?: number; ts?: number;
};

let _sub: { remove: () => void } | null = null;

export function subscribeNativeLocations(cb: (l: NativeLoc) => void) {
  if (Platform.OS !== 'android') return () => {};
  const emitter = new NativeEventEmitter(Native);
  _sub?.remove?.();
  _sub = emitter.addListener('heidesteinLocation', cb);
  return () => { _sub?.remove?.(); _sub = null; };
}
