// ============================================================================
// Imports & Types
// ============================================================================
import React from 'react';
import * as Application from 'expo-application';
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/AppNavigator';
import { useSettings } from '../settings/SettingsContext';
import styles from '../styles';

// ============================================================================
// Constants
// ============================================================================
const INTERVALS = [1000, 2000, 5000, 10000, 30000];

// ============================================================================
// Component
// ============================================================================
export default function SettingsScreen() {
  // --------------------------------------------------------------------------
  // Settings / Navigation / Insets
  // --------------------------------------------------------------------------
  const { theme, setTheme, intervalMs, setIntervalMs, unitSystem, setUnitSystem } = useSettings();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <SafeAreaView
      style={[{ flex: 1 }, theme === 'dark' ? styles.darkBg : styles.lightBg]}
      edges={['top', 'bottom']}
    >
      <View style={{ flex: 1 }}>
        {/* Logo */}
        <View style={[styles.logoRow(theme), { paddingTop: insets.top }]}>
          <Image
            source={require('../assets/logo.png')}
            style={[styles.logo, { textAlign: 'center' }]}
            resizeMode="contain"
          />
        </View>

        <View style={styles.headerRow(theme)}>
          <Text style={[styles.title(theme), { flex: 1, textAlign: 'center' }]}>SETTINGS</Text>
        </View>

        <View
          style={[
            styles.header,
            { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
          ]}
        >
          <Pressable onPress={() => navigation.navigate('Tracking')} style={styles.btn(theme)}>
            <Text style={styles.btnText(theme)}>Back</Text>
          </Pressable>
        </View>

        {/* Theme */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle(theme)}>Theme</Text>
          <View style={styles.row}>
            {(['light', 'dark'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTheme(t)}
                style={[styles.pill, theme === t && styles.pillActive(theme)]}
              >
                <Text style={styles.pillText(theme)}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Interval */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle(theme)}>Update Interval</Text>
          <View style={styles.rowWrap}>
            {INTERVALS.map((ms) => (
              <TouchableOpacity
                key={ms}
                onPress={() => setIntervalMs(ms)}
                style={[styles.pill, intervalMs === ms && styles.pillActive(theme)]}
              >
                <Text style={styles.pillText(theme)}>
                  {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint(theme)}>
            This controls the foreground & background timeInterval passed to Location updates. Lower
            = more detailed (more battery).
          </Text>
        </View>

        {/* Units */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle(theme)}>Units</Text>
          <View style={styles.row}>
            {(['metric', 'imperial'] as const).map((us) => (
              <TouchableOpacity
                key={us}
                onPress={() => setUnitSystem(us)}
                style={[styles.pill, unitSystem === us && styles.pillActive(theme)]}
              >
                <Text style={styles.pillText(theme)}>{us}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Version */}
        <View style={styles.section}>
          <Text
            style={[
              { marginTop: 20, opacity: 0.7 },
              { color: theme === 'dark' ? '#cbd5e1' : '#374151' },
            ]}
          >
            v{Application.nativeApplicationVersion} (build {Application.nativeBuildVersion})
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
