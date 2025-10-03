import { NativeModules, Platform } from 'react-native';
const Native = NativeModules.StickyNotification;

export const StickyNotification = {
  async show(title: string, body: string) { if (Platform.OS === 'android') await Native?.show?.(title, body); },
  async update(title: string, body: string) { if (Platform.OS === 'android') await Native?.update?.(title, body); },
  async hide() { if (Platform.OS === 'android') await Native?.hide?.(); },
};
