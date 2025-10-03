// src/actions/runs.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteRun, listTracks } from '../db';
import { stopBackground } from '../BackgroundTask';

// keep in sync with TrackingScreen
const ACTIVE_KEY = 'active_run_v2';

type Options = {
  /** Stop the background service before deleting (recommended). Default: true */
  stopBg?: boolean;
  /** Clear ACTIVE_KEY from AsyncStorage. Default: true */
  clearActiveKey?: boolean;
  /** Return the refreshed list of tracks after delete. Default: true */
  returnList?: boolean;
};

export async function safeDeleteRun(trackId: string, opts: Options = {}): Promise<void> {
  const { stopBg = true, clearActiveKey = true } = opts;

  // 1) Make sure nothing is writing while we delete
  if (stopBg) {
    try { await stopBackground(); } catch {}
  }
  if (clearActiveKey) {
    try { await AsyncStorage.removeItem(ACTIVE_KEY); } catch {}
  }

  // 2) Delete from DB (child → parent inside deleteRun)
  await deleteRun(trackId);
}

export async function safeDeleteRunAndList(trackId: string, opts: Options = {}): Promise<import('../db').TrackMeta[]> {
  await safeDeleteRun(trackId, opts);
  // 3) Return fresh archive data
  return await listTracks();
}
