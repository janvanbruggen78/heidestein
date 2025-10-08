import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  AccessibilityInfo,
} from 'react-native';
import { 
  useFocusEffect, 
  useNavigation 
} from '@react-navigation/native';

type ShowOptions = {
  durationMs?: number;  
  persistent?: boolean;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function useToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [actionLabel, setActionLabel] = useState<string | undefined>(undefined);
  const [onActionPress, setOnActionPress] = useState<(() => void) | undefined>(undefined);

  const fade = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(16)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [fade, translate]);

  const animateOut = useCallback((onEnd?: () => void) => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(translate, { toValue: 16, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      onEnd?.();
    });
  }, [fade, translate]);

  const hideToast = useCallback(() => {
    clearTimer();
    fade.stopAnimation();
    translate.stopAnimation();
    animateOut();
  }, [animateOut, clearTimer, fade, translate]);

  const showToast = useCallback((msg: string, opts?: ShowOptions) => {
    clearTimer();
    setMessage(msg);
    setActionLabel(opts?.actionLabel);
    setOnActionPress(() => (opts?.onActionPress ? opts.onActionPress : undefined));
    setVisible(true);

    AccessibilityInfo.announceForAccessibility?.(msg);

    fade.stopAnimation();
    translate.stopAnimation();
    translate.setValue(16);
    fade.setValue(0);
    animateIn();

    const duration =
      opts?.persistent ? null : (typeof opts?.durationMs === 'number' ? opts.durationMs : 4000);

    if (duration != null) {
      timerRef.current = setTimeout(() => hideToast(), duration);
    }
  }, [animateIn, clearTimer, fade, hideToast, translate]);

  const showPersistent = useCallback((msg: string) => showToast(msg, { persistent: true }), [showToast]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);


  const Toast = visible ? (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, {zIndex: 9999, elevation: 9999}]}>
      <View style={styles.host} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: fade,
              transform: [{ translateY: translate }],
            },
          ]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Text style={{ color: 'white', textAlign: 'center' }}>
            {message === 'Track saved to archive.' ? (
              <>
                Track saved to{' '}
                <Text
                  style={{ textDecorationLine: 'underline' }}
                  onPress={() => {
                    setVisible(false);
                    navigation.navigate('Archive');
                  }}
                >
                  Archive
                </Text>
                .
              </>
            ) : (
              message
            )}
          </Text>

          {actionLabel ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onActionPress}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text style={styles.action}>{actionLabel}</Text>
            </TouchableOpacity>
          ) : null}

        </Animated.View>
      </View>
    </View>
  ) : null;

  return { showToast, showPersistent, hideToast, Toast };
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    justifyContent: 'flex-end',
    zIndex: 9999,
    elevation: 9999
  },
  toast: {
    alignSelf: 'center',
    marginHorizontal: 16,
    marginBottom: 140,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 600,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(28,28,30,0.92)',
  },
  text: {
    flexShrink: 1,
    color: 'white',
    fontSize: 15,
    lineHeight: 20,
  },
  action: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});

export default useToast;
