/**
 * Sheet — docked bottom panel: surface, radius 10 top corners, hairline
 * top, 36x4 ink-3 drag handle. Slides up over 240ms
 * cubic-bezier(.2,.8,.2,1); resolves instantly under reduced motion.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { motion, radius, space } from '@sotto/core/theme';
import { useTheme } from './theme';
import { useReducedMotion } from './useReducedMotion';
import { resolveSheetDrag, sheetDragOffset } from './sheetDrag';

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
  /** Rendered as the sheet's last child, below (and outside) the scrolling
   * body — the mockup's `.transport` sits there, after `.talk`, and must
   * stay reachable however far the panel above it has scrolled. */
  footer?: React.ReactNode;
  /** Reports the sheet's own (untransformed) layout height, e.g. so a
   * caller can reserve scroll content padding for the full docked stack. */
  onHeightChange?: (height: number) => void;
  /** The reader's unselected state is intentionally compact but still keeps
   * its transport footer available. When this changes after a handle
   * dismissal, Sheet animates the definition body down to that compact
   * height before its parent clears the selected word. */
  compact?: boolean;
  /** Enables the handle as a downward-drag and accessible dismiss control.
   * Omitted by the settings and vocabulary sheets, whose handles remain
   * decorative. */
  onDismiss?: () => void;
  dismissAccessibilityLabel?: string;
  /** Identifies the definition being dismissed. A new selection cancels a
   * pending collapse so its completion cannot clear the newer definition. */
  dismissKey?: unknown;
};

export function Sheet({
  visible,
  children,
  style,
  bottomOffset = 0,
  footer,
  onHeightChange,
  compact = false,
  onDismiss,
  dismissAccessibilityLabel = 'Dismiss',
  dismissKey,
}: SheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const animation = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const bodyHeight = useRef(new Animated.Value(0)).current;
  const compactHeightRef = useRef(0);
  const expandedHeightRef = useRef(0);
  const wasCompactRef = useRef(compact);
  const dismissingRef = useRef(false);
  const dismissKeyRef = useRef(dismissKey);
  const dismissalVersionRef = useRef(0);
  const [bodyHeightControlled, setBodyHeightControlled] = useState(false);
  const bodyHeightControlledRef = useRef(false);
  const suppressDragPressRef = useRef(false);
  const dragPressTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reduced = useReducedMotion();

  const clearDragPress = useCallback(() => {
    clearTimeout(dragPressTimerRef.current);
    dragPressTimerRef.current = undefined;
    suppressDragPressRef.current = false;
  }, []);

  const expireDragPress = useCallback(() => {
    // Some touch browsers cancel the post-drag click entirely. Keep the
    // suppression bounded so a later accessibility click can still dismiss.
    clearTimeout(dragPressTimerRef.current);
    dragPressTimerRef.current = setTimeout(clearDragPress, 250);
  }, [clearDragPress]);

  const setControlledBodyHeight = useCallback((controlled: boolean) => {
    bodyHeightControlledRef.current = controlled;
    setBodyHeightControlled(controlled);
  }, []);

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

  const settleBody = useCallback(
    (toValue: number, animated: boolean, onComplete?: () => void) => {
      if (!animated) {
        bodyHeight.setValue(toValue);
        onComplete?.();
        return;
      }
      Animated.timing(bodyHeight, {
        toValue,
        duration: motion.sheet.durationMs,
        easing: SLIDE_EASING,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) onComplete?.();
      });
    },
    [bodyHeight],
  );

  const dismiss = useCallback(
    (distance: number, cancelled: boolean) => {
      if (!onDismiss || compact || dismissingRef.current) return;
      const decision = resolveSheetDrag({ distance, cancelled, reducedMotion: reduced });
      if (decision.action === 'restore') {
        settleBody(expandedHeightRef.current, decision.animated, () => {
          setControlledBodyHeight(false);
        });
        return;
      }

      const compactHeight = compactHeightRef.current;
      const expandedHeight = expandedHeightRef.current;
      if (compactHeight === 0 || expandedHeight === 0) {
        // This only occurs before the sheet has laid out. Preserve a usable
        // dismissal instead of leaving the handle in an indeterminate state.
        onDismiss();
        return;
      }

      dismissingRef.current = true;
      if (!bodyHeightControlledRef.current) bodyHeight.setValue(expandedHeight);
      setControlledBodyHeight(true);
      const dismissalVersion = dismissalVersionRef.current;
      const finish = () => {
        if (dismissalVersion !== dismissalVersionRef.current) return;
        bodyHeight.setValue(compactHeight);
        onDismiss();
      };
      // As this body gets shorter, the sheet's bottom dock keeps the
      // transport fixed and moves the top edge (and handle) down with it.
      // Starting from the live drag height makes the release continuous.
      settleBody(compactHeight, decision.animated, finish);
    },
    [bodyHeight, compact, onDismiss, reduced, setControlledBodyHeight, settleBody],
  );

  useEffect(() => {
    const wasCompact = wasCompactRef.current;
    wasCompactRef.current = compact;
    if (!compact && wasCompact) {
      // A newly selected word restores the sheet's natural definition
      // height. It deliberately does not inherit the previous drag offset.
      dismissingRef.current = false;
      setControlledBodyHeight(false);
    } else if (compact && !wasCompact && dismissingRef.current) {
      // The parent has now cleared its definition only after the collapse
      // reached the compact height, so revealing the empty state cannot
      // produce a visible height jump.
      dismissingRef.current = false;
      setControlledBodyHeight(false);
    } else if (compact && !wasCompact) {
      bodyHeight.setValue(compactHeightRef.current);
      setControlledBodyHeight(true);
    }
  }, [bodyHeight, compact, setControlledBodyHeight]);

  useEffect(() => {
    if (dismissKeyRef.current === dismissKey) return;
    dismissKeyRef.current = dismissKey;
    dismissalVersionRef.current += 1;
    bodyHeight.stopAnimation();
    dismissingRef.current = false;
    setControlledBodyHeight(false);
  }, [bodyHeight, dismissKey, setControlledBodyHeight]);

  useEffect(
    () => () => {
      bodyHeight.stopAnimation();
      clearDragPress();
    },
    [bodyHeight, clearDragPress],
  );

  const handlePanResponder = useMemo(
    () =>
      onDismiss
        ? PanResponder.create({
            // The responder belongs only to the handle. ScrollView content
            // keeps its own native scrolling gesture untouched.
            onMoveShouldSetPanResponderCapture: (_, gesture) =>
              !compact &&
              !dismissingRef.current &&
              gesture.dy > 4 &&
              Math.abs(gesture.dy) > Math.abs(gesture.dx),
            onPanResponderGrant: () => {
              clearDragPress();
              suppressDragPressRef.current = true;
              bodyHeight.stopAnimation();
              if (!bodyHeightControlledRef.current) {
                bodyHeight.setValue(expandedHeightRef.current);
              }
              setControlledBodyHeight(true);
            },
            onPanResponderMove: (_, gesture) => {
              const expandedHeight = expandedHeightRef.current;
              const compactHeight = compactHeightRef.current;
              if (expandedHeight === 0 || compactHeight === 0) return;
              setControlledBodyHeight(true);
              bodyHeight.setValue(
                Math.max(compactHeight, expandedHeight - sheetDragOffset(gesture.dy)),
              );
            },
            onPanResponderRelease: (_, gesture) => {
              expireDragPress();
              dismiss(gesture.dy, false);
            },
            onPanResponderTerminate: (_, gesture) => {
              expireDragPress();
              dismiss(gesture.dy, true);
            },
          })
        : undefined,
    [
      bodyHeight,
      clearDragPress,
      compact,
      dismiss,
      expireDragPress,
      onDismiss,
      setControlledBodyHeight,
    ],
  );

  const contentHeight = bodyHeightControlled ? bodyHeight : undefined;

  return (
    <Animated.View
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!visible}
      pointerEvents={visible ? 'auto' : 'none'}
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[
        styles.sheet,
        { bottom: bottomOffset },
        style,
        { transform: [{ translateY }], display: visible ? 'flex' : 'none' },
      ]}
    >
      <Animated.View
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          if (bodyHeightControlledRef.current || dismissingRef.current) return;
          if (compact) compactHeightRef.current = height;
          else expandedHeightRef.current = height;
        }}
        style={[
          styles.content,
          contentHeight === undefined ? undefined : { height: contentHeight },
        ]}
      >
        {onDismiss ? (
          <View
            {...handlePanResponder?.panHandlers}
            // Pressable owns its responder handlers, so drag capture must
            // live on a parent that can take over once the finger moves.
            style={Platform.OS === 'web' ? ({ touchAction: 'none' } as ViewStyle) : undefined}
            testID="sheet-handle"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dismissAccessibilityLabel}
              disabled={compact}
              onPressIn={clearDragPress}
              onPress={() => {
                // Web emits a click after releasing a drag, even after the
                // parent takes over the responder. A short drag must finish
                // snapping back instead of being treated as a dismiss tap,
                // including when reduced motion settles it immediately.
                if (suppressDragPressRef.current) {
                  clearDragPress();
                  return;
                }
                if (!bodyHeightControlledRef.current) dismiss(Infinity, false);
              }}
              style={styles.handleTarget}
            >
              <View style={styles.handle} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.handle} />
        )}
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
      {footer}
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
    content: {
      flexShrink: 1,
      overflow: 'hidden',
    },
    handleTarget: {
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      marginBottom: space.xs,
    },
    handle: {
      width: 36,
      height: 4,
      // Mockup line 161: `.handle{...border-radius:2px}`. radius.full is
      // reserved for the speaker and play rings.
      borderRadius: radius.sm,
      backgroundColor: colors.ink3,
      alignSelf: 'center',
    },
  });
}
