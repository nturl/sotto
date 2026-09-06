/**
 * TabBar — phone tab bar (DESIGN.md navigation): surface bar with a top
 * hairline; active tab = accent icon + label at 500 weight, inactive ink-2.
 * Icons are 24px strokes: star (Pour toi), open book (Bibliothèque),
 * graduation cap (Vocabulaire), gear (Settings). Hidden at >= 900px, where
 * Shell renders the sidebar instead.
 *
 * CONFIRM 25 / card B: Settings is a fourth row alongside the three real
 * tab-navigator routes, even though it isn't one of the `Tabs.Screen`s in
 * `app/(tabs)/_layout.tsx` (it lives at `app/settings/index.tsx`, outside
 * the tabs group) — `buildTabRows` appends it as a plain nav link
 * (`router.push`), not a `navigation.navigate` tab switch.
 *
 * Props are typed structurally so we don't import @react-navigation types
 * (not a declared dependency of @sotto/client); the Tabs layout casts.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@sotto/core/theme';
import { useTheme } from './theme';
import { useT, type MessageKey } from '../i18n/useT';
import { fonts } from './fonts';
import { CapGlyph, OpenBookGlyph, SettingsGlyph, StarGlyph } from './Glyphs';
import { buildTabRows } from './navRows';
import { Text } from './Text';
import { webCursor } from './tokens';

export { buildTabRows };

export type TabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  navigation: {
    emit: (event: { type: 'tabPress'; target?: string; canPreventDefault?: boolean }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
};

const TAB_ICONS: Record<string, (props: { color: string }) => React.ReactNode> = {
  home: ({ color }) => <StarGlyph color={color} />,
  library: ({ color }) => <OpenBookGlyph color={color} />,
  vocabulary: ({ color }) => <CapGlyph color={color} />,
  settings: ({ color }) => <SettingsGlyph color={color} />,
};

export function TabBar({ state, navigation }: TabBarProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (width >= 900) return null;

  const rows = buildTabRows(state.routes);

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {rows.map((row, index) => {
        // Settings also counts "active" while /profile is still the live
        // settings screen (pre lane-E rename).
        const focused = row.isSettings
          ? pathname.endsWith('settings') || pathname.endsWith('profile')
          : state.index === index;
        const color = focused ? colors.accent : colors.ink2;
        const onPress = () => {
          if (row.isSettings) {
            router.push('/settings');
            return;
          }
          const event = navigation.emit({
            type: 'tabPress',
            target: row.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(row.name);
        };
        return (
          <Pressable
            key={row.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            style={[styles.tab, webCursor]}
          >
            {TAB_ICONS[row.name]?.({ color })}
            <Text
              role="caption"
              size={11}
              style={{ color, fontFamily: focused ? fonts.interMedium : fonts.interRegular }}
            >
              {t(`tabs.${row.name}` as MessageKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      paddingTop: 10,
      paddingBottom: space.sm,
      minHeight: space.tapTarget,
    },
  });
}
