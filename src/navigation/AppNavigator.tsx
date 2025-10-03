// src/navigation/AppNavigator.tsx
import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';

// Settings
import { SettingsProvider, useSettings } from '../settings/SettingsContext';

// Screens
import TrackingScreen from '../screens/TrackingScreen';
import ArchiveScreen from '../screens/ArchiveScreen';
import DetailScreen from '../screens/DetailScreen';
import SettingsScreen from '../screens/SettingsScreen';

// Strongly-typed route params
export type RootStackParamList = {
  Tracking: undefined;
  Archive: undefined;
  Detail: { runId: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const DarkThemeNav: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#000000',
    card: '#000000',
    text: '#ffffff',
    border: '#111111',
    primary: '#4f46e5',
  },
};

const LightThemeNav: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#ffffff',
    card: '#ffffff',
    text: '#000000',
    border: '#e5e7eb',
    primary: '#4f46e5',
  },
};

function InnerNavigator() {
  const { theme } = useSettings(); // ✅ hook inside component

  // Android system nav bar background to match theme
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme === 'dark' ? '#000000' : '#ffffff').catch(() => {});
  }, [theme]);

  return (
    <>
      {/* Status bar icons color + background */}
      <StatusBar
        style={theme === 'dark' ? 'light' : 'dark'}
        backgroundColor={theme === 'dark' ? '#000000' : '#ffffff'}
      />

      <NavigationContainer theme={theme === 'dark' ? DarkThemeNav : LightThemeNav}>
        <Stack.Navigator
          initialRouteName="Tracking"
          screenOptions={{
            headerShown: false, // screens render their own headers
            animation: 'fade',
          }}
        >
          <Stack.Screen name="Tracking" component={TrackingScreen} />
          <Stack.Screen name="Archive" component={ArchiveScreen} />
          <Stack.Screen name="Detail" component={DetailScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function AppNavigator() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Provider wraps the navigator so hooks are available inside */}
      <SettingsProvider>
        <InnerNavigator />
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}
