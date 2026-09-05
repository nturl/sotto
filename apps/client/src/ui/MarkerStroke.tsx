/**
 * MarkerStroke — DESIGN.md device B. A skewed #mark rectangle with rough
 * ends drawn UNDER a saved word. Save sweeps it in left to right, 240ms
 * cubic-bezier(.2,.8,.2,1); unsaving erases right to left (the clip window
 * shrinks from the right edge). Render inside a relative wrapper around the
 * word; it positions itself along the baseline.
 *
 * The rough ends come from a stretched SVG polygon (web). On native — until
 * react-native-svg can be installed — the stroke is a flat mark block with
 * the same sweep, skew and timing.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { colors, motion } from '@sotto/core/theme';
import { MarkerStrokeShape } from './Glyphs';
import { useReducedMotion } from './useReducedMotion';

const SWEEP_EASING = Easing.bezier(0.2, 0.8, 0.2, 1);

export function MarkerStroke({ active, height = 8 }: { active: boolean; height?: number }) {
  const [width, setWidth] = useState(0);
  const animation = useRef(new Animated.Value(active ? 1 : 0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      animation.setValue(active ? 1 : 0);
      return;
    }
    Animated.timing(animation, {
      toValue: active ? 1 : 0,
      duration: motion.savedWordSweep.durationMs,
      easing: SWEEP_EASING,
      useNativeDriver: false,
    }).start();
  }, [active, reduced, animation]);

  const clipWidth = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(width, 1)],
  });

  return (
    <View
      pointerEvents="none"
      style={[styles.host, { height }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.clip, { width: clipWidth, transform: [{ skewX: '-10deg' }] }]}>
        {Platform.OS === 'web' ? (
          <MarkerStrokeShape width={width} height={height} color={colors.mark} />
        ) : (
          <View style={[styles.fallback, { backgroundColor: colors.mark }]} />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 1,
    right: 1,
    bottom: -2,
  },
  clip: {
    height: '100%',
    overflow: 'hidden',
  },
  fallback: {
    flex: 1,
  },
});
