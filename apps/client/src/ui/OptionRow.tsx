/**
 * OptionRow — onboarding/settings language row: surface row with a hairline
 * divider, Fraunces native name + localized caption; the selected row gets
 * the 3px accent left bar (one of the two places accent is allowed beyond
 * CTA/active-tab, per DESIGN.md onboarding spec).
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { space } from '@sotto/core/theme';
import { useTheme } from './theme';
import { Text } from './Text';
import { webCursor } from './tokens';

export type OptionRowProps = {
  nativeName: string;
  localizedName?: string;
  selected: boolean;
  onPress: () => void;
};

export function OptionRow({ nativeName, localizedName, selected, onPress }: OptionRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.row, selected && styles.selected, webCursor]}
    >
      <View>
        <Text role="reading" size={17}>
          {nativeName}
        </Text>
        {localizedName ? (
          <Text role="caption" style={styles.localized}>
            {localizedName}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      paddingVertical: space.lg,
      paddingHorizontal: 14,
      minHeight: space.tapTarget,
      justifyContent: 'center',
    },
    selected: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      paddingLeft: 11,
    },
    localized: {
      marginTop: 2,
    },
  });
}
