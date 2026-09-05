/**
 * Settings > Appearance — System / Light / Dark (DESIGN.md dark-mode task).
 * Mirrors OptionRow's visual language (surface row, hairline divider,
 * accent left bar on the selected row) but reads colors through
 * useTheme() instead of the static `colors` import — OptionRow itself is
 * outside this dispatch's ownership ceiling and stays statically light, so
 * a straight reuse would render a light row on this screen even in dark
 * mode.
 *
 * The screen title below deliberately stays the plain (static-light) Text,
 * not ThemedText: it sits directly on Shell's own canvas, and Shell.tsx is
 * outside this dispatch's ownership ceiling (explicitly: "Do NOT edit ...
 * Shell.tsx layout logic") so that canvas never actually turns dark — a
 * ThemedText title there would render near-white on a still-light
 * background instead. Only the option-row card below gets a real
 * theme-aware background (via inline styles), so only its own text uses
 * ThemedText.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { space } from '@sotto/core/theme';
import type { UserPreferences } from '@sotto/core';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { setPreference, usePreferences } from '../../src/ui/data';
import { Text } from '../../src/ui/Text';
import { ThemedText, useTheme } from '../../src/ui/theme';
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
              <ThemedText role="reading" size={17}>
                {t(`settings.scheme.${scheme}` as const)}
              </ThemedText>
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
