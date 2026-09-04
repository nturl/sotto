/**
 * Card — surface, radius 10, hairline border. Cards never carry shadows
 * (the cutout is reserved for covers, the daily card and the primary CTA).
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, space } from '@sotto/core/theme';

export type CardProps = {
  children: React.ReactNode;
  padding?: number;
  style?: ViewStyle;
};

export function Card({ children, padding = space.lg, style }: CardProps) {
  return <View style={[styles.card, { padding }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
});
