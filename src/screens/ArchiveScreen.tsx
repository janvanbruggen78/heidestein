// ============================================================================
// Imports & Types
// ============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/AppNavigator';
import { useSettings } from '../settings/SettingsContext';
import { 
  haversine, 
  listTracks, 
  loadTrackPoints, 
  type TrackMeta 
} from '../db/db';
import styles from '../styles';

// ============================================================================
// Component
// ============================================================================
export default function ArchiveScreen() {
  // --------------------------------------------------------------------------
  // Navigation / Insets / Settings
  // --------------------------------------------------------------------------
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { theme } = useSettings();

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [tracks, setTracks] = useState<TrackMeta[]>([]);
  const [sortKey, setSortKey] = useState<'date_desc' | 'date_asc' | 'dist_desc' | 'dist_asc'>('date_desc');
  const [menuOpen, setMenuOpen] = useState(false);

  // --------------------------------------------------------------------------
  // Effects (load data)
  // --------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const rows = await listTracks();
      // compute distance per track from its segments (no gaps bridged)
      const withDistances = await Promise.all(
        rows.map(async (row) => {
          try {
            const segments = await loadTrackPoints(row.track_id);
            let total = 0;
            for (const seg of segments) {
              for (let i = 1; i < seg.length; i++) {
                total += haversine(seg[i - 1], seg[i]);
              }
            }
            return { ...row, distance: total };
          } catch (e) {
            console.warn(e);
            return { ...row, distance: row.distance ?? 0 };
          }
        }),
      );
      setTracks(withDistances);
    })();
  }, []);

  // --------------------------------------------------------------------------
  // Local Helpers
  // --------------------------------------------------------------------------
  const startedAtMs = useCallback((r: any): number => {
    // Prefer created/started timestamps; fallback to ISO id
    if (typeof r?.started_at === 'number') return r.started_at;
    if (typeof r?.created_at === 'number') return r.created_at;
    const t = Date.parse(r?.id ?? '');
    return Number.isFinite(t) ? t : 0;
  }, []);

  const formatWhen = useCallback(
    (r: any): string => {
      const ms = startedAtMs(r);
      return ms ? new Date(ms).toLocaleString() : '—';
    },
    [startedAtMs],
  );

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

        {/* Title */}
        <View style={styles.headerRow(theme)}>
          <Text style={[styles.title(theme), { flex: 1, textAlign: 'center' }]}>ARCHIVE</Text>
        </View>

        {/* Header controls: Back */}
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

        {/* List */}
        <FlatList
          data={tracks}
          keyExtractor={(i) => String(i.track_id)}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('Detail', { trackId: item.track_id })}
            >
              <Text style={styles.cardTitle}>{!item.label ? item.track_id : item.label}</Text>
              <Text style={styles.cardTitle}>{formatWhen(item)}</Text>
              <Text style={styles.cardSub}>{((item.distance ?? 0) / 1000).toFixed(2)} km</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: theme === 'dark' ? '#aaa' : '#666' }}>No tracks yet</Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}
