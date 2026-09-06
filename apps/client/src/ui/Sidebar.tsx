/**
 * Sidebar — desktop (>= 900px) navigation: 220px surface column with a
 * hairline right edge, "Sotto" wordmark in Fraunces 300, three scrolling
 * nav rows plus a Settings row pinned to the bottom slot (CONFIRM 25: four
 * rows total — Home, Library, Vocabulary, Settings; active = surface-2
 * fill, ink 500 label; inactive ink-2).
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { useTheme } from './theme';
import { useT } from '../i18n/useT';
import { fonts } from './fonts';
import { NAV_ROWS, SETTINGS_ROW, type NavRow } from './navRows';
import { Text } from './Text';
import { webCursor } from './tokens';

export { NAV_ROWS, SETTINGS_ROW };

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderRow = (row: NavRow, active: boolean) => (
    <Pressable
      key={row.segment}
      onPress={() => router.push(row.href as Parameters<typeof router.push>[0])}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      style={[styles.row, active && styles.rowActive, webCursor]}
    >
      <Text
        role="ui"
        size={15}
        color={active ? 'ink' : 'ink2'}
        style={active ? styles.labelActive : undefined}
      >
        {t(row.labelKey)}
      </Text>
    </Pressable>
  );

  // Settings also counts "active" while /profile is still the live
  // settings screen (pre lane-E rename) so the sidebar highlights the
  // right row either way.
  const settingsActive = pathname.endsWith('settings') || pathname.endsWith('profile');

  return (
    <View style={styles.sidebar}>
      <Text role="display" size={22} style={styles.wordmark}>
        {t('common.appName')}
      </Text>
      {NAV_ROWS.map((row) => renderRow(row, pathname.endsWith(row.segment)))}
      <View style={styles.spacer} />
      {renderRow(SETTINGS_ROW, settingsActive)}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    sidebar: {
      width: 220,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderRightColor: colors.hairline,
      paddingHorizontal: space.gutter.phone,
      paddingVertical: space.xl,
    },
    spacer: {
      flex: 1,
    },
    wordmark: {
      marginBottom: 28,
    },
    row: {
      paddingVertical: 10,
      paddingHorizontal: space.sm,
      borderRadius: space.sm,
      marginBottom: space.xs,
      minHeight: space.tapTarget,
      justifyContent: 'center',
    },
    rowActive: {
      backgroundColor: colors.surface2,
    },
    labelActive: {
      fontFamily: fonts.interMedium,
    },
  });
}
