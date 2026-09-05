import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { useT, type MessageKey } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { setPreference, usePreferences } from '../../src/ui/data';
import type { BookLevel } from '../../src/ui/dev/fixtures';
import { OptionRow } from '../../src/ui/OptionRow';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';

const LEVELS: Array<{ value: BookLevel; descKey: MessageKey }> = [
  { value: 'A0', descKey: 'onboarding.level.a0.desc' },
  { value: 'A1', descKey: 'onboarding.level.a1.desc' },
  { value: 'A2', descKey: 'onboarding.level.a2.desc' },
];

export default function OnboardingLevelScreen() {
  const t = useT();
  const router = useRouter();
  const preferences = usePreferences();
  const { gutter } = useLayoutMetrics();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [level, setLevel] = useState<BookLevel>('A1');

  // Same gate as onboarding/languages.tsx and app/index.tsx: an
  // already-onboarded user landing here directly (deep link, back
  // navigation) goes to home instead of redoing setup.
  if (preferences.onboarded) return <Redirect href="/(tabs)/home" />;

  const finish = () => {
    setPreference('level', level);
    setPreference('onboarded', true);
    router.replace('/(tabs)/home');
  };

  return (
    <Shell contentBottomPadding={120} sidebar={false}>
      <Text role="display" style={styles.title}>
        {t('onboarding.step.level')}
      </Text>

      <View style={styles.list}>
        {LEVELS.map((item) => (
          <OptionRow
            key={item.value}
            nativeName={item.value}
            localizedName={t(item.descKey)}
            selected={level === item.value}
            onPress={() => setLevel(item.value)}
          />
        ))}
      </View>

      <View style={[styles.footer, { paddingHorizontal: gutter, paddingBottom: space.lg }]}>
        <Button title={t('common.continue')} onPress={finish} />
      </View>
    </Shell>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    title: {
      marginBottom: space.xl,
    },
    list: {
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: space.md,
      backgroundColor: colors.canvas,
    },
  });
}
