import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

export async function promptIgnoreBatteryOptimizations() {
  if (Platform.OS !== 'android') return;
  try {
    await IntentLauncher.startActivityAsync(
      // Takes the user to: Settings > Battery > Ignore optimizations for app
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
    );
  } catch (e) {
    console.warn('Battery optimization intent failed', e);
  }
}
