// src/settings/SettingsContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

type Theme = 'light' | 'dark';
type UnitSystem = 'metric' | 'imperial';

type SettingsState = {
  theme: Theme;
  intervalMs: number;
  unitSystem: UnitSystem;
};

type SettingsContextValue = SettingsState & {
  setTheme: (t: Theme) => void;
  setIntervalMs: (ms: number) => void;
  setUnitSystem: (u: UnitSystem) => void;
};

const DEFAULTS: SettingsState = {
  theme: 'dark',
  intervalMs: 5000,
  unitSystem: 'metric', // will be overridden on first run if locale suggests otherwise
};

const KEY = 'app_settings_v1';

const Ctx = createContext<SettingsContextValue | null>(null);

// --- helper: choose a sensible default from locale (runs only if nothing was saved)
function detectDefaultUnit(): UnitSystem {
  try {
    // Newer Expo returns measurementSystem: 'metric' | 'us' | 'uk'
    const locales = (Localization as any).getLocales?.() ?? [];
    const l0 = locales[0];

    const ms: string | undefined = l0?.measurementSystem;
    if (ms === 'us' || ms === 'uk') return 'imperial'; // road distances in miles

    // Fallback by region code if measurementSystem isn’t available
    const region = (l0?.regionCode || Localization.region)?.toUpperCase?.();
    // Countries primarily using miles for distances
    if (region && ['US', 'LR', 'MM', 'GB'].includes(region)) return 'imperial';

    return 'metric';
  } catch {
    return 'metric';
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(DEFAULTS.theme);
  const [intervalMs, setIntervalMs] = useState<number>(DEFAULTS.intervalMs);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(DEFAULTS.unitSystem);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<SettingsState>;
          if (saved.theme === 'light' || saved.theme === 'dark') setTheme(saved.theme);
          if (typeof saved.intervalMs === 'number') setIntervalMs(saved.intervalMs);
          if (saved.unitSystem === 'metric' || saved.unitSystem === 'imperial') {
            setUnitSystem(saved.unitSystem);
          } else {
            // No saved unit → detect a friendly default from locale
            setUnitSystem(detectDefaultUnit());
          }
        } else {
          // First run → detect unit from locale
          setUnitSystem(detectDefaultUnit());
        }
      } catch {
        // On error, just fall back to defaults
        setUnitSystem(detectDefaultUnit());
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(KEY, JSON.stringify({ theme, intervalMs, unitSystem })).catch(() => {});
  }, [theme, intervalMs, unitSystem, loaded]);

  const value = useMemo<SettingsContextValue>(
    () => ({ theme, intervalMs, unitSystem, setTheme, setIntervalMs, setUnitSystem }),
    [theme, intervalMs, unitSystem]
  );

  if (!loaded) return null; // avoid flashing defaults before load

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings must be used within SettingsProvider');
  return v;
}
