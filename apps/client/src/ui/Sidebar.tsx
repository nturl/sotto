/**
 * Sidebar — desktop (>= 900px) navigation: 220px surface column with a
 * hairline right edge, "Sotto" wordmark in Fraunces 300, three nav rows
 * (active = surface-2 fill, ink 500 label; inactive ink-2).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { colors, space } from '@sotto/core/theme';
import { useT, type MessageKey } from '../i18n/useT';
import { fonts } from './fonts';
import { Text } from './Text';
import { webCursor } from './tokens';

const NAV_ROWS: Array<{ segment: string; href: '/(tabs)/home' | '/(tabs)/library' | '/(tabs)/vocabulary'; labelKey: MessageKey }> = [
  { segment: 'home', href: '/(tabs)/home', labelKey: 'tabs.home' },
  { segment: 'library', href: '/(tabs)/library', labelKey: 'tabs.library' },
  { segment: 'vocabulary', href: '/(tabs)/vocabulary', labelKey: 'tabs.vocabulary' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();

  return (
    <View style={styles.sidebar}>
      <Text role="display" size={22} style={styles.wordmark}>
        {t('common.appName')}
      </Text>
      {NAV_ROWS.map((row) => {
        const active = pathname.endsWith(row.segment);
        return (
          <Pressable
            key={row.segment}
            onPress={() => router.push(row.href)}
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 220,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.hairline,
    paddingHorizontal: space.gutter.phone,
    paddingVertical: space.xl,
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
