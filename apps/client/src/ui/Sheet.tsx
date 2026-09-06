/**
 * Sheet — docked bottom panel: surface, radius 10 top corners, hairline
 * top, 36x4 ink-3 drag handle. Slides up over 240ms
 * cubic-bezier(.2,.8,.2,1); resolves instantly under reduced motion.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { motion, radius, space } from '@sotto/core/theme';
import { useTheme } from './theme';
import { useReducedMotion } from './useReducedMotion';

const SLIDE_EASING = Easing.bezier(0.2, 0.8, 0.2, 1);

/** How far below the screen the sheet starts before sliding in. A fixed
 * constant (comfortably taller than the sheet's own 60% maxHeight on any
 * phone viewport) rather than the sheet's own measured layout height: the
 * panel's content height changes (empty state -> a full translation panel),
 * and animating relative to a value that can change mid-flight left the
 * slide-in stuck partway on web instead of settling flush at the bottom. */
const OFFSCREEN_OFFSET = 600;

export type SheetProps = {
  visible: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
  /** Distance from the screen bottom to dock at (default 0). Lets a sibling
   * docked bar — e.g. the reader's narration transport — sit below the
   * sheet instead of the two overlapping (DESIGN.md: "Narration transport
   * below the panel"). */
  bottomOffset?: number;
  /** Reports the sheet's own (untransformed) layout height, e.g. so a
   * caller can reserve scroll content padding for the full docked stack. */
  onHeightChange?: (height: number) => void;
};

export function Sheet({ visible, children, style, bottomOffset = 0, onHeightChange }: SheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const animation = useRef(new Animated.Value(visible ? 1 : 0)).current;
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
      useNativeDriver: false,
    }).start();
  }, [visible, reduced, animation]);

  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [OFFSCREEN_OFFSET, 0],
  });

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[styles.sheet, { bottom: bottomOffset }, style, { transform: [{ translateY }] }]}
    >
      <View style={styles.handle} />
      {/* flexShrink lets the ScrollView give up height to the sheet's own
       * maxHeight (set by callers, e.g. the reader's 60%-of-viewport mobile
       * sheet) instead of forcing the sheet to grow to content size; once
       * shrunk, content taller than the available space scrolls internally
       * rather than clipping silently. */}
      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
      borderTopLeftRadius: radius.md,
      borderTopRightRadius: radius.md,
      paddingTop: space.md,
      overflow: 'hidden',
    },
    scrollBody: {
      flexShrink: 1,
      flexGrow: 0,
    },
    scrollContent: {
      paddingHorizontal: space.gutter.phone,
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
}
