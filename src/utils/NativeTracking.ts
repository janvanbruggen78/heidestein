import { Platform, NativeModules, DeviceEventEmitter } from 'react-native';

const Native = NativeModules.Tracking as
  | {
      start(opts: {
        title: string;
        intervalMs?: number;
        distanceM?: number;
        paused?: boolean;
      }): Promise<void>;
      updateOptions(opts: {
        title?: string;
        intervalMs?: number;
        distanceM?: number;
        paused?: boolean;
      }): Promise<void>;
      updateNotification(title: string, body: string): Promise<void>;
      stop(): Promise<void>;
    }
  | undefined;

export type NativeLoc = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  altitude?: number;
  ts?: number;
};

export function startNativeTracking(opts: {
  title: string;
  intervalMs?: number;
  distanceM?: number;
  paused?: boolean;
}) {
  if (Platform.OS !== 'android') return Promise.resolve();
  return Native?.start?.(opts) ?? Promise.resolve();
}

export function updateNativeOptions(opts: {
  title?: string;
  intervalMs?: number;
  distanceM?: number;
  paused?: boolean;
}) {
  if (Platform.OS !== 'android') return Promise.resolve();
  return Native?.updateOptions?.(opts) ?? Promise.resolve();
}

export function updateNativeNotification(title: string, body: string) {
  if (Platform.OS !== 'android') return Promise.resolve();
  return Native?.updateNotification?.(title, body) ?? Promise.resolve();
}

export function stopNativeTracking() {
  if (Platform.OS !== 'android') return Promise.resolve();
  return Native?.stop?.() ?? Promise.resolve();
}

export function subscribeNativeLocations(cb: (l: NativeLoc) => void) {
  if (Platform.OS !== 'android') return () => {};
  const sub = DeviceEventEmitter.addListener('heidesteinLocation', cb);
  return () => sub.remove();
}
