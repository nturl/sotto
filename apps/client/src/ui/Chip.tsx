/**
 * Chip — outlined hairline pill in surface-2 with ink text; selected = ink
 * fill with surface text (deliberately NOT accent, per DESIGN.md).
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { radius, space } from '@sotto/core/theme';
import { useTheme } from './theme';
import { Text } from './Text';
import { webCursor } from './tokens';

export type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function Chip({ label, selected, onPress }: ChipProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={space.sm}
      style={[styles.chip, selected && styles.selected, webCursor]}
    >
      <Text role="caption" color={selected ? 'surface' : 'ink'}>
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    chip: {
      backgroundColor: colors.surface2,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.hairline,
      paddingVertical: space.sm,
      paddingHorizontal: 14,
      justifyContent: 'center',
    },
    selected: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
  });
}
