/**
 * Button — DESIGN.md variants:
 *  - primary: the cutout CTA. Accent fill, surface label, 4px ink cutout
 *    shadow; press/hover pushes paper flat (translate 2,2, shadow shrinks to
 *    2px, 120ms ease). The cutout is drawn as an offset View behind the face
 *    so it renders identically on web and native — no blurred shadows, ever.
 *  - secondary: surface-2 fill, ink label.
 *  - ghost: transparent, ink label.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { motion, radius, shadow, space } from '@sotto/core/theme';
import { themeColors as colors } from './theme';
import { Text } from './Text';
import { webCursor } from './tokens';
import { useReducedMotion } from './useReducedMotion';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export function usePressAnimation(engaged: boolean): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      value.setValue(engaged ? 1 : 0);
      return;
    }
    Animated.timing(value, {
      toValue: engaged ? 1 : 0,
      duration: motion.press.durationMs,
      easing: Easing.ease,
      useNativeDriver: true,
    }).start();
  }, [engaged, reduced, value]);
  return value;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const animation = usePressAnimation(!disabled && (pressed || hovered));

  const faceTranslate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, shadow.cutoutInk.offsetX - shadow.pressed.offsetX],
  });
  const shadowOffset = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [shadow.cutoutInk.offsetX, shadow.pressed.offsetX],
  });
  const fade = animation.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] });

  const isPrimary = variant === 'primary';
  const faceStyle: ViewStyle =
    variant === 'secondary'
      ? { backgroundColor: colors.surface2 }
      : variant === 'ghost'
        ? { backgroundColor: 'transparent' }
        : { backgroundColor: disabled ? colors.surface2 : colors.accent };
  const labelColor = disabled ? 'ink3' : isPrimary ? 'surface' : 'ink';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.wrap, webCursor, style]}
    >
      <View>
        {isPrimary ? (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.cutout,
              !disabled && { backgroundColor: colors.ink },
              { transform: [{ translateX: shadowOffset }, { translateY: shadowOffset }] },
            ]}
          />
        ) : null}
        <Animated.View
          style={[
            styles.face,
            faceStyle,
            isPrimary
              ? { transform: [{ translateX: faceTranslate }, { translateY: faceTranslate }] }
              : { opacity: disabled ? 1 : fade },
          ]}
        >
          {icon}
          <Text role="uiButton" color={labelColor}>
            {title}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
  },
  cutout: {
    borderRadius: radius.md,
  },
  face: {
    minHeight: space.tapTarget,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
});
