// src/components/RouteCanvas.tsx
// Draws each segment separately (no cross-segment lines)
// Pinch zoom around focal point; double-tap to reset

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  ViewStyle,
  StyleProp,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSettings } from '../settings/SettingsContext';

export type LatLng = { latitude: number; longitude: number };

type Props = {
  segments: LatLng[][];
  focusPoint?: { latitude: number; longitude: number } | null;
  distance: number;               // kept for parity (unused)
  style?: StyleProp<ViewStyle>;   // parent controls size
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const TAP_SLOP = 6;
const DOUBLE_TAP_MS = 250;

export default function RouteCanvas({ segments, style }: Props) {
  const { theme } = useSettings();
  const strokeColor = theme === 'dark' ? '#fff' : '#000';

  // Size driven by parent
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: any) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  // --- Data prep ---
  const padding = 16;
  const allPts = useMemo(() => segments.flat(), [segments]);

  const bounds = useMemo(() => {
    if (allPts.length === 0) {
      return { minLat: 0, maxLat: 1e-6, minLon: 0, maxLon: 1e-6 };
    }
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of allPts) {
      if (p.latitude  < minLat) minLat = p.latitude;
      if (p.latitude  > maxLat) maxLat = p.latitude;
      if (p.longitude < minLon) minLon = p.longitude;
      if (p.longitude > maxLon) maxLon = p.longitude;
    }
    const latPad = (maxLat - minLat) || 1e-6;
    const lonPad = (maxLon - minLon) || 1e-6;
    return {
      minLat: minLat - latPad * 0.05,
      maxLat: maxLat + latPad * 0.05,
      minLon: minLon - lonPad * 0.05,
      maxLon: maxLon + lonPad * 0.05,
    };
  }, [allPts]);

  const projectBase = (pt: LatLng) => {
    const { minLat, maxLat, minLon, maxLon } = bounds;
    const w = Math.max(1, size.w - padding * 2);
    const h = Math.max(1, size.h - padding * 2);
    const x = ((pt.longitude - minLon) / Math.max(maxLon - minLon, 1e-9)) * w + padding;
    const y = ((maxLat - pt.latitude)  / Math.max(maxLat - minLat, 1e-9)) * h + padding;
    return { x, y };
  };

  // --- View transform (pan + zoom)
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const scaleRef = useRef(scale);
  const txRef    = useRef(tx);
  const tyRef    = useRef(ty);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { txRef.current    = tx;    }, [tx]);
  useEffect(() => { tyRef.current    = ty;    }, [ty]);

  const resetView = () => { setScale(1); setTx(0); setTy(0); };

  const applyTransform = (xy: { x: number; y: number }) => ({
    x: xy.x * scale + tx,
    y: xy.y * scale + ty,
  });

  const totalPoints = React.useMemo(
    () => segments.reduce((acc, s) => acc + s.length, 0),[segments]
  );

  const paths = useMemo(() => {
    if (!size.w || !size.h) return [];
    return segments.map(seg => {
      if (!seg.length) return '';
      const p0 = applyTransform(projectBase(seg[0]));
      let d = `M ${p0.x} ${p0.y}`;
      for (let i = 1; i < seg.length; i++) {
        const p = applyTransform(projectBase(seg[i]));
        d += ` L ${p.x} ${p.y}`;
      }
      return d;
    });
  }, [segments, bounds, scale, tx, ty, size.w, size.h]);

  // Last point + pulse
  const lastPoint = allPts.length ? allPts[allPts.length - 1] : null;
  const lastXY = lastPoint ? applyTransform(projectBase(lastPoint)) : null;

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!lastXY) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [lastXY, pulse]);
  // const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  // const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.3] });

  // at the top of RouteCanvas component:
  const pulseScale = React.useRef(new Animated.Value(1)).current;
  const pulseOpacity = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale,  { toValue: 1.4, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseScale,  { toValue: 1.0, duration:   0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity,{ toValue: 0.0, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseOpacity,{ toValue: 1.0, duration:   0, useNativeDriver: true }),
        ]),
      ])
    );

    loop.start();
    return () => { loop.stop(); };
  }, []); // <-- IMPORTANT: run regardless of lastXY/points


  // --- Gestures
  const startRef = useRef({
    scale: 1,
    tx: 0,
    ty: 0,
    startX: 0,
    startY: 0,
    touches: [] as { x: number; y: number }[],
    startDist: 1,
    startFocal: { x: 0, y: 0 },
    moved: false,
  });
  const lastTapTsRef = useRef(0);

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  // CHANGED: always use local coordinates for focal math (fixes bottom-right zoom)
  const touchesToXY = (evt: GestureResponderEvent) => {
    const t = (evt.nativeEvent.touches || []) as any[];
    return t.map(ti => ({ x: ti.locationX, y: ti.locationY })); // <- use locationX/Y only
  };

  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const focal = (ts: { x: number; y: number }[]) => {
    if (ts.length === 0) return { x: 0, y: 0 };
    const sx = ts.reduce((s, t) => s + t.x, 0);
    const sy = ts.reduce((s, t) => s + t.y, 0);
    return { x: sx / ts.length, y: sy / ts.length };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const ts = touchesToXY(evt);
        startRef.current = {
          scale: scaleRef.current,
          tx:    txRef.current,
          ty:    tyRef.current,
          startX: ts[0]?.x ?? 0,
          startY: ts[0]?.y ?? 0,
          touches: ts,
          startDist: ts.length >= 2 ? distance(ts[0], ts[1]) : 1,
          startFocal: focal(ts),
          moved: false,
        };
      },

      onPanResponderMove: (evt: GestureResponderEvent, gs: PanResponderGestureState) => {
        const ts = touchesToXY(evt);

        // If we started with 1 finger and now have 2, initialize pinch baseline NOW
        if (ts.length === 2 && startRef.current.touches.length < 2) {
          startRef.current.touches = ts;
          startRef.current.startDist = distance(ts[0], ts[1]) || 1;
          startRef.current.startFocal = focal(ts);
          startRef.current.scale = scaleRef.current;
          startRef.current.tx    = txRef.current;
          startRef.current.ty    = tyRef.current;
        }

        if (!startRef.current.moved && (Math.abs(gs.dx) > TAP_SLOP || Math.abs(gs.dy) > TAP_SLOP)) {
          startRef.current.moved = true;
        }

        if (ts.length >= 2 && startRef.current.touches.length >= 2) {
          const d0 = startRef.current.startDist || 1;
          const d1 = distance(ts[0], ts[1]) || 1;
          const raw = (d1 / d0) * startRef.current.scale;
          const newScale = clamp(raw, MIN_SCALE, MAX_SCALE);

          const f0 = startRef.current.startFocal;
          const f1 = focal(ts);
          const sRatio = newScale / (startRef.current.scale || 1);

          const newTx = f0.x + (startRef.current.tx - f0.x) * sRatio + (f1.x - f0.x);
          const newTy = f0.y + (startRef.current.ty - f0.y) * sRatio + (f1.y - f0.y);

          setScale(newScale);
          setTx(newTx);
          setTy(newTy);
        } else {
          const dx = (ts[0]?.x ?? 0) - startRef.current.startX;
          const dy = (ts[0]?.y ?? 0) - startRef.current.startY;
          setTx(startRef.current.tx + dx);
          setTy(startRef.current.ty + dy);
        }
      },

      onPanResponderRelease: (_evt, gs) => {
        const wasTap = Math.abs(gs.dx) <= TAP_SLOP && Math.abs(gs.dy) <= TAP_SLOP;
        if (wasTap) {
          const now = Date.now();
          if (now - lastTapTsRef.current < DOUBLE_TAP_MS) resetView();
          lastTapTsRef.current = now;
        }
      },

      onPanResponderTerminationRequest: () => true,
      onPanResponderTerminate: () => {},
    })
  ).current;

  return (
    <View
      style={[{ flex: 1 }, styles.container(theme), style]}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      <Svg width={Math.max(1, size.w)} height={Math.max(1, size.h)}>
        {paths.map((d, idx) =>
          d ? <Path key={idx} d={d} stroke={strokeColor} strokeWidth={3} fill="none" strokeOpacity={0.9} /> : null
        )}
      </Svg>

      {lastXY && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulse(theme),
              {
                left: lastXY.x - 10,
                top: lastXY.y - 10,
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />
          <View pointerEvents="none" style={[styles.dot(theme), { left: lastXY.x - 4, top: lastXY.y - 4 }]} />
        </>
      )}
      {totalPoints === 0 && size && size.w !== 0 && size.h !== 0 && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulse(theme),
              {
                left: size.w / 2 - 10,
                top: size.h / 2 - 10,
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />
          <View pointerEvents="none" style={[styles.dot(theme), { left: size.w / 2 - 4, top: size.h / 2 - 4 }]}/>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:  (theme: 'light' | 'dark') => ({
    backgroundColor: theme === 'dark' ? '#000' : '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#1f1f22',
  }),
  pulse:  (theme: 'light' | 'dark') => ({
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme === 'dark' ? '#fff' : '#000',
  }),
  dot:  (theme: 'light' | 'dark') => ({
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme === 'dark' ? '#fff' : '#000',
  }),
});
