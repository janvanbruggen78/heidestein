// ============================================================================
// Imports
// ============================================================================
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

// ============================================================================
// Types
// ============================================================================
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

// ============================================================================
// Defaults & Storage Keys
// ============================================================================
const DEFAULTS: SettingsState = {
  theme: 'dark',
  intervalMs: 5000,
  unitSystem: 'metric',
};

const KEY = 'app_settings_v1';

// ============================================================================
// Context
// ============================================================================
const Ctx = createContext<SettingsContextValue | null>(null);

// ============================================================================
// Helpers
// ============================================================================
function detectDefaultUnit(): UnitSystem {
  try {
    const locales = (Localization as any).getLocales?.() ?? [];
    const l0 = locales[0];

    const ms: string | undefined = l0?.measurementSystem;
    if (ms === 'us' || ms === 'uk') return 'imperial'; // Miles

    // Fallback by region code
    const region = (l0?.regionCode || Localization.region)?.toUpperCase?.();
    if (region && ['US', 'LR', 'MM', 'GB'].includes(region)) return 'imperial';

    return 'metric';
  } catch {
    return 'metric';
  }
}

// ============================================================================
// Provider
// ============================================================================
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(DEFAULTS.theme);
  const [intervalMs, setIntervalMs] = useState<number>(DEFAULTS.intervalMs);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(DEFAULTS.unitSystem);
  const [loaded, setLoaded] = useState(false);

  // Load persisted settings
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
            setUnitSystem(detectDefaultUnit());
          }
        } else {
          setUnitSystem(detectDefaultUnit());
        }
      } catch {
        setUnitSystem(detectDefaultUnit());
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Persist on change
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(KEY, JSON.stringify({ theme, intervalMs, unitSystem })).catch(() => {});
  }, [theme, intervalMs, unitSystem, loaded]);

  // Memoize context value
  const value = useMemo<SettingsContextValue>(
    () => ({ theme, intervalMs, unitSystem, setTheme, setIntervalMs, setUnitSystem }),
    [theme, intervalMs, unitSystem],
  );

  if (!loaded) return null;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ============================================================================
// Hook
// ============================================================================
export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings must be used within SettingsProvider');
  return v;
}
