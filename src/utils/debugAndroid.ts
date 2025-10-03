// src/utils/debugAndroid.ts
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

export async function logLocationTaskState(taskName: string) {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(taskName);
    const prov = await Location.getProviderStatusAsync();
    console.log('[DBG] hasStartedLocationUpdatesAsync:', started);
    console.log('[DBG] providerStatus:', prov);
  } catch (e) {
    console.warn('[DBG] hasStarted/provider failed', e);
  }
}

export async function logNotificationPermAndChannels() {
  if (Platform.OS !== 'android') return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    console.log('[DBG] notif perm:', perm);
    const channels = await Notifications.getNotificationChannelsAsync();
    console.log('[DBG] channels:', channels);
  } catch (e) {
    console.warn('[DBG] notif query failed', e);
  }
}

// Creates/ensures a channel, then posts a test notification so we know notifications are working.
export async function ensureChannelAndPing(channelId = 'tracking') {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: 'Tracking',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0],
      sound: null,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      showBadge: false,
    });
    console.log('[DBG] channel ensured:', channelId);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test notification',
        body: 'If you see this, notifications work.',
      },
      trigger: null, // fire immediately
    });
    console.log('[DBG] test notification fired');
  } catch (e) {
    console.warn('[DBG] channel/test notif failed', e);
  }
}
