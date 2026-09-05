/**
 * Settings > Appearance — System / Light / Dark (DESIGN.md dark-mode task).
 * Mirrors OptionRow's visual language (surface row, hairline divider,
 * accent left bar on the selected row); now that OptionRow itself follows
 * `useTheme()` this screen could reuse it directly, but it keeps its own
 * inline row markup (predates OptionRow's migration) rather than a
 * behavior-risking swap.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { space } from '@sotto/core/theme';
import type { UserPreferences } from '@sotto/core';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { setPreference, usePreferences } from '../../src/ui/data';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';
import { Shell } from '../../src/ui/Shell';

const SCHEMES: NonNullable<UserPreferences['colorScheme']>[] = ['system', 'light', 'dark'];

export default function AppearanceScreen() {
  const t = useT();
  const preferences = usePreferences();
  const { colors } = useTheme();
  const selected = preferences.colorScheme ?? 'system';

  return (
    <Shell>
      <BackLink />
      <Text role="display" style={styles.title}>
        {t('settings.scheme.title')}
      </Text>
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.hairline }]}
      >
        {SCHEMES.map((scheme, index) => {
          const isSelected = selected === scheme;
          return (
            <Pressable
              key={scheme}
              onPress={() => setPreference('colorScheme', scheme)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              style={[
                styles.row,
                index < SCHEMES.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors.hairline,
                },
                isSelected && {
                  borderLeftWidth: 3,
                  borderLeftColor: colors.accent,
                  paddingLeft: 11,
                },
                webCursor,
              ]}
            >
              <Text role="reading" size={17}>
                {t(`settings.scheme.${scheme}` as const)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: space.lg,
    marginBottom: space.xl,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    paddingVertical: space.lg,
    paddingHorizontal: 14,
    minHeight: space.tapTarget,
    justifyContent: 'center',
  },
});
