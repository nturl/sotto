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

const SCHEMES: UserPreferences['narrationSpeed'][] = [0.75, 1, 1.25];

export default function NarrationSpeedScreen() {
  const t = useT();
  const preferences = usePreferences();
  const { colors } = useTheme();
  const selected = preferences.narrationSpeed;

  return (
    <Shell>
      <BackLink />
      <Text role="display" style={styles.title}>
        {t('settings.narrationSpeed')}
      </Text>
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.hairline }]}
      >
        {SCHEMES.map((scheme, index) => {
          const isSelected = selected === scheme;
          return (
            <Pressable
              key={scheme}
              onPress={() => setPreference('narrationSpeed', scheme)}
              accessibilityRole="radio"
              aria-checked={isSelected}
              accessibilityState={{ checked: isSelected }}
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
                {scheme}×
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
