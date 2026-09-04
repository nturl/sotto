/**
 * Toast — ink surface, surface text, auto-dismisses after 4s (DESIGN.md
 * vocabulary undo toast). Position it by rendering inside a relative parent.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { colors, motion, radius, space } from '@sotto/core/theme';
import { Text } from './Text';
import { useReducedMotion } from './useReducedMotion';

export type ToastProps = {
  message: string | null;
  onHide?: () => void;
  durationMs?: number;
};

export function Toast({ message, onHide, durationMs = 4000 }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!message) return undefined;
    if (reduced) {
      opacity.setValue(1);
    } else {
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.sheet.durationMs,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
        useNativeDriver: true,
      }).start();
    }
    const timer = setTimeout(() => {
      if (reduced) {
        opacity.setValue(0);
        onHide?.();
      } else {
        Animated.timing(opacity, {
          toValue: 0,
          duration: motion.press.durationMs,
          easing: Easing.ease,
          useNativeDriver: true,
        }).start(() => onHide?.());
      }
    }, durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, reduced, opacity, onHide]);

  if (!message) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]} accessibilityLiveRegion="polite">
      <Text role="ui" color="surface">
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: space.xl,
    alignSelf: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    zIndex: 10,
  },
});
