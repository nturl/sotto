/**
 * Sidebar — desktop navigation, matching the mockup's `.side` / `.nav`
 * (`app-mockup-v2.html:38-43`): a 220px surface column with a hairline
 * right edge and 24/20 padding, the "Sotto" wordmark in Fraunces 300 at
 * 26, three text nav rows (9/12 padding, radius 10, 15px, 2px apart) plus
 * a Settings row pinned to the bottom slot (CONFIRM 25: four rows total —
 * Home, Library, Vocabulary, Settings; active = surface-2 fill, ink 500
 * label; inactive ink-2). Text rows only — the four glyphs from
 * `navRows.ts` are the phone tab bar's, not the sidebar's.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { radius, space } from '@sotto/core/theme';
import { useTheme } from './theme';
import { useT } from '../i18n/useT';
import { fonts } from './fonts';
import { NAV_ROWS, SETTINGS_ROW, type NavRow } from './navRows';
import { Text } from './Text';
import { webCursor } from './tokens';

export { NAV_ROWS, SETTINGS_ROW };

/** The mockup's `.app` grid puts the sidebar at a fixed 220px. */
export const SIDEBAR_WIDTH = 220;

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
      <Text role="display" size={26} style={styles.wordmark}>
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
      width: SIDEBAR_WIDTH,
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
      paddingVertical: 9,
      paddingHorizontal: space.sm,
      borderRadius: radius.md,
      marginBottom: 2,
      // DESIGN.md "Radius, elevation, spacing": tap targets 44 minimum.
      // The mockup's row box is 38 tall; we keep 44 and let the surface-2
      // active fill grow with it rather than shrink the hit area.
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
