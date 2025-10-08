// ============================================================================
// Imports & Types
// ============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import RouteCanvas from '../components/RouteCanvas';
import {
  deleteTrack,
  getTrackLabel,
  getTrackMeta,
  haversine,
  loadTrackPoints,
  newSegmentIndex,
  setTrackLabel,
} from '../db/db';
import { 
  buildGPX, 
  buildSVG, 
  saveAndShare 
} from '../utils/routeExport';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useSettings } from '../settings/SettingsContext';
import { 
  formatDistance, 
  formatDuration, 
  formatPace, 
  formatSpeed, 
  formatTitle 
} from '../utils/format';
import styles from '../styles';

// ============================================================================
// Constants
// ============================================================================
const ACTIVE_KEY = 'active_run_v2';

// ============================================================================
// Local Types & Helpers
// ============================================================================
type LatLng = { latitude: number; longitude: number };
type LatLngTs = LatLng & { ts?: number };

type DetailRoute = RouteProp<RootStackParamList, 'Detail'>;

function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// ============================================================================
// Component
// ============================================================================
export default function DetailScreen() {
  // --------------------------------------------------------------------------
  // Navigation / Insets / Settings
  // --------------------------------------------------------------------------
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<DetailRoute>();
  const insets = useSafeAreaInsets();
  const { theme, unitSystem } = useSettings();

  // --------------------------------------------------------------------------
  // Params
  // --------------------------------------------------------------------------
  const trackId = params?.trackId;

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [segmentsTs, setSegmentsTs] = useState<LatLngTs[][]>([[]]);
  const [meta, setMeta] = useState<{
    track_id: string;
    started_at: number;
    ended_at: number | null;
    distance?: number | null;
  } | null>(null);

  const [label, setLabel] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState('');

  // --------------------------------------------------------------------------
  // Effects (load points + meta + label)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!trackId) {
      console.warn('[Detail] Missing trackId route param. Params:', params);
      return;
    }
    (async () => {
      const segs = await loadTrackPoints(trackId);
      setSegmentsTs(segs as LatLngTs[][]);
      setMeta(await getTrackMeta(trackId));
    })();
  }, [trackId, params]);

  useEffect(() => {
    getTrackLabel(trackId).then(setLabel).catch(() => {});
  }, [trackId]);

  // --------------------------------------------------------------------------
  // Derived / Computed
  // --------------------------------------------------------------------------
  // Prefer timestamp-based duration; sum last.ts - first.ts per segment that has timestamps.
  // TODO - Move to utility
  const durationMs = useMemo(() => {
    let hasAnyTs = false;
    let sum = 0;
    for (const seg of segmentsTs) {
      if (seg.length >= 2) {
        const firstTs = seg[0]?.ts;
        const lastTs = seg[seg.length - 1]?.ts;
        if (typeof firstTs === 'number' && typeof lastTs === 'number' && lastTs > firstTs) {
          hasAnyTs = true;
          sum += lastTs - firstTs;
        }
      }
    }
    if (!hasAnyTs && meta) {
      return (meta.ended_at ?? Date.now()) - meta.started_at;
    }
    return sum;
  }, [segmentsTs, meta]);

  const segmentsForCanvas = useMemo<LatLng[][]>(
    () => segmentsTs.map((seg) => seg.map(({ latitude, longitude }) => ({ latitude, longitude }))),
    [segmentsTs],
  );

  const title = useMemo(() => {
    const fromLabel = label?.trim();
    if (fromLabel) return fromLabel;
    if (trackId) return trackId;
    return 'Untitled track'; // last-resort guard
  }, [label, trackId]);

  const computedDistance = useMemo(() => {
    let total = 0;
    for (const seg of segmentsTs) {
      for (let i = 1; i < seg.length; i++) {
        const a = seg[i - 1];
        const b = seg[i];
        if (
          typeof a?.latitude === 'number' &&
          typeof a?.longitude === 'number' &&
          typeof b?.latitude === 'number' &&
          typeof b?.longitude === 'number'
        ) {
          total += haversine(a, b);
        }
      }
    }
    return total;
  }, [segmentsTs]);

  const hasRoute = segmentsForCanvas.flat().length > 1;
  const distance = computedDistance;
  const started_at = meta?.started_at ?? null;

  // --------------------------------------------------------------------------
  // Event Handlers
  // --------------------------------------------------------------------------
  async function resumeRunAndGoTracking() {
    try {
      const seg = await newSegmentIndex(trackId);
      await AsyncStorage.setItem(
        ACTIVE_KEY,
        JSON.stringify({
          id: trackId,
          seg,
          autoResume: true,
          resumeHint: 'new-segment', // lets Tracking pre-add empty segment
        }),
      );
      navigation.navigate('Tracking');
    } catch (e) {
      console.error('Resume failed', e);
      Alert.alert('Could not resume', 'An error occurred while trying to resume this track.');
    }
  }

  async function exportGPX(trackId: string) {
    const meta = await getTrackMeta(trackId);
    const segments = await loadTrackPoints(trackId); // returns P[][]
    const name = (meta?.title || `Track ${trackId}`).replace(/\s+/g, '_');
    const gpx = buildGPX(name, segments);
    await saveAndShare(gpx, `${name}.gpx`, 'application/gpx+xml');
  }

  async function exportSVG(trackId: string) {
    const segments = await loadTrackPoints(trackId);
    const titleText = label?.trim() || trackId;
    const subtitleText = `${formatDistance(distance, unitSystem)} • ${formatDuration(durationMs)}`;
    const svg = buildSVG(segments, 2480, 3508, 120, {
      title: titleText,
      subtitle: subtitleText,
      fontFamily: 'serif',
      color: '#111',
      titleSize: 96,
      subtitleSize: 64,
    });

    await saveAndShare(svg, `route_${trackId}.svg`, 'image/svg+xml');
  }

  const confirmDelete = async () => {
    if (Platform.OS === 'web') {
      const ok = window.confirm(`Delete track ${trackId}?\nThis cannot be undone.`);
      if (ok) {
        await deleteTrack(trackId);
        navigation.navigate('Archive');
      }
      return;
    }
    Alert.alert(`Delete track ${trackId}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTrack(trackId);
          navigation.navigate('Archive');
        },
      },
    ]);
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <SafeAreaView
      style={[{ flex: 1 }, theme === 'dark' ? styles.darkBg : styles.lightBg]}
      edges={['top', 'bottom']}
    >
      <View style={{ flex: 1 }}>
        {/* Header block */}
        <View style={[styles.logoRow(theme), { paddingTop: insets.top }]}>
          <Image
            source={require('../assets/logo.png')}
            style={[styles.logo, { textAlign: 'center' }]}
            resizeMode="contain"
          />
        </View>

        <View style={styles.headerRow(theme)}>
          <Pressable
            onPress={() => {
              setDraft(title);
              setEditOpen(true);
            }}
            accessibilityRole="button"
            style={{ flexDirection: 'column', flex: 1 }}
          >
            <Text style={[styles.title(theme), { textAlign: 'center' }]}>{title}</Text>
            <Text
              style={[
                { opacity: 0.6, marginTop: 4, textAlign: 'center' },
                { color: theme === 'dark' ? '#cbd5e1' : '#374151' },
              ]}
            >
              tap to rename
            </Text>
          </Pressable>
        </View>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.navigate('Archive')} style={styles.btn(theme)}>
            <Text style={styles.btnText(theme)}>Back</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', marginLeft: 'auto' }}>
            <TouchableOpacity
              onPress={resumeRunAndGoTracking}
              style={[styles.btn(theme), styles.buttonPrimary]}
            >
              <Text style={[styles.btnText(theme),styles.buttonTextPrimary]}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete} style={[styles.btn(theme), { backgroundColor: '#7f1d1d', borderColor: "transparent", marginLeft: 8 }]}>
              <Text style={[styles.btnText(theme), { color: '#fff' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Metrics -- Move to component */}
        <View style={styles.metrics(theme)}>
          <Metric label="Distance" value={formatDistance(distance, unitSystem)} />
          <Metric label="Duration" value={formatDuration(durationMs)} />
          <Metric label="Avg Speed" value={formatSpeed(distance / (durationMs / 1000), unitSystem)} />
          {/* <Metric label="Pace" value={formatPace(distance, durationMs, unitSystem)} /> */}
        </View>

        {/* RouteCanvas in a flex parent (fills remaining space) */}
        <View style={{ flex: 1, width: '100%' }}>
          <RouteCanvas segments={segmentsForCanvas} distance={distance} style={{ flex: 1 }} />
        </View>

        {/* Controls */}
        <View style={[styles.controls(theme), { paddingBottom: Math.max(12, insets.bottom) }]}>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => exportGPX(trackId)} style={styles.btn(theme)}>
              <Text style={styles.btnText(theme)}>Download GPX</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => exportSVG(trackId)} style={styles.btn(theme)}>
              <Text style={styles.btnText(theme)}>Download SVG</Text>
            </TouchableOpacity>
          </View>

          {!hasRoute && (
            <Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 8 }}>
              No points recorded in this track.
            </Text>
          )}
        </View>

        {/* Label modal */}
        <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setEditOpen(false)}>
            <View
              style={{
                margin: 24,
                padding: 16,
                borderRadius: 16,
                backgroundColor: 'white',
                // dark mode? wrap with theme if needed
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Route label</Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="e.g. Heidestein loop via tree"
                autoFocus
                style={{
                  borderWidth: 1,
                  borderColor: '#ddd',
                  padding: 10,
                  borderRadius: 10,
                  // add dark styles from your theme as needed
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    setDraft('');
                  }}
                >
                  <Text style={{ padding: 8 }}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    const clean = draft.trim();
                    await setTrackLabel(trackId, clean.length ? clean : null);
                    setLabel(clean.length ? clean : null);
                    setEditOpen(false);
                  }}
                >
                  <Text style={{ padding: 8, fontWeight: '700' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

// ============================================================================
// Presentational -- TODO - Move to separate component
// ============================================================================
function Metric({ label, value }: { label: string; value: string }) {
  const { theme } = useSettings();
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel(theme)}>{label}</Text>
      <Text style={styles.metricValue(theme)}>{value}</Text>
    </View>
  );
}
