/**
 * Sheet — docked bottom panel: surface, radius 10 top corners, hairline
 * top, 36x4 ink-3 drag handle. Slides up over 240ms
 * cubic-bezier(.2,.8,.2,1); resolves instantly under reduced motion.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, motion, radius, space } from '@sotto/core/theme';
import { useReducedMotion } from './useReducedMotion';

const SLIDE_EASING = Easing.bezier(0.2, 0.8, 0.2, 1);

export type SheetProps = {
  visible: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
};

export function Sheet({ visible, children, style }: SheetProps) {
  const [height, setHeight] = useState(0);
  const animation = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      animation.setValue(visible ? 1 : 0);
      return;
    }
    Animated.timing(animation, {
      toValue: visible ? 1 : 0,
      duration: motion.sheet.durationMs,
      easing: SLIDE_EASING,
      useNativeDriver: true,
    }).start();
  }, [visible, reduced, animation]);

  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [height || 600, 0],
  });

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={[styles.sheet, style, { transform: [{ translateY }] }]}
    >
      <View style={styles.handle} />
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    paddingHorizontal: space.gutter.phone,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.ink3,
    alignSelf: 'center',
    marginBottom: space.xs,
  },
});
