/**
 * IconButton — 44px icon-only button. Variants:
 *  - ghost: bare ink-stroke icon (home header, voice controls).
 *  - ring: the speaker button — accent as a 2px OUTLINE only, radius full
 *    (the accent fill is reserved for the CTA and the active tab).
 */
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, space } from '@sotto/core/theme';
import { usePressAnimation } from './Button';
import { webCursor } from './tokens';

export type IconButtonProps = {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'ghost' | 'ring';
  size?: number;
  style?: ViewStyle;
};

export function IconButton({ icon, onPress, accessibilityLabel, variant = 'ghost', size = space.tapTarget, style }: IconButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const animation = usePressAnimation(pressed || hovered);
  const fade = animation.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[webCursor, style]}
    >
      <Animated.View
        style={[
          styles.base,
          { width: size, height: size, opacity: fade },
          variant === 'ring' && styles.ring,
        ]}
      >
        {icon}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: space.tapTarget,
    minHeight: space.tapTarget,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
});
