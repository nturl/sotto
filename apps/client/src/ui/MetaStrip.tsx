/**
 * MetaStrip — surface-2 pill, radius 10: clock glyph + mono "12 MIN",
 * hairline divider, level glyph + mono "A1".
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, space } from '@sotto/core/theme';
import { useTheme } from './theme';
import { useT } from '../i18n/useT';
import { ClockGlyph, LevelGlyph } from './Glyphs';
import { Text } from './Text';

export function MetaStrip({ minutes, level }: { minutes: number; level: string }) {
  const t = useT();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.strip}>
      <ClockGlyph size={16} color={colors.ink} />
      <Text role="mono" color="ink">
        {t('book.minutesAbbr', { count: minutes })}
      </Text>
      <View style={styles.divider} />
      <LevelGlyph size={16} color={colors.ink} />
      <Text role="mono" color="ink">
        {level}
      </Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    strip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
    },
    divider: {
      width: 1,
      height: 12,
      backgroundColor: colors.hairline,
    },
  });
}
