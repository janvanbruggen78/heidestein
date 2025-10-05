// App.tsx
import React, { useEffect } from 'react';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import { SettingsProvider, useSettings } from './src/settings/SettingsContext';

import './src/services/background';


function AppInner() {
  const { theme } = useSettings();

  useEffect(() => {
    const bg = theme === 'dark' ? '#000000' : '#fff';
    SystemUI.setBackgroundColorAsync(bg).catch(() => {});
    NavigationBar.setBackgroundColorAsync(bg).catch(() => {});
    NavigationBar.setButtonStyleAsync(theme === 'dark' ? 'light' : 'dark').catch(() => {});
  }, [theme]);

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <AppNavigator />
    </>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <SafeAreaProvider>
        <AppInner />
      </SafeAreaProvider>
    </SettingsProvider>
  );
}
