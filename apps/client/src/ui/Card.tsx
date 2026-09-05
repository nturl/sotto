/**
 * Card — surface, radius 10, hairline border. Cards never carry shadows
 * (the cutout is reserved for covers, the daily card and the primary CTA).
 */
import { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { radius, space } from '@sotto/core/theme';
import { useTheme } from './theme';

export type CardProps = {
  children: React.ReactNode;
  padding?: number;
  style?: ViewStyle;
};

export function Card({ children, padding = space.lg, style }: CardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={[styles.card, { padding }, style]}>{children}</View>;
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
  });
}
