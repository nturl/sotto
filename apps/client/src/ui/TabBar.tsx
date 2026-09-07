/**
 * TabBar — phone tab bar (DESIGN.md navigation): surface bar with a top
 * hairline; active tab = accent glyph + label at 500 weight, inactive
 * ink-2. Glyphs are the mockup's four ink drawings at 22px, stroke 1.5
 * (`app-mockup-v2.html:345-348`): open book (For you), shelves (Library),
 * bookmark (Vocabulary), sun-gear (Settings) — the name → component
 * mapping lives here, the row → name pairing in `navRows.ts` so it can be
 * tested without a react-native import. Bar padding is the mockup's
 * `10px 8px 22px`; on a device the 22 gives way to the safe-area inset
 * when that is larger. Hidden at >= DESKTOP_BREAKPOINT, where Shell
 * renders the sidebar instead.
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
import { BookmarkGlyph, BookOpenGlyph, GearGlyph, ShelvesGlyph, type GlyphProps } from './Glyphs';
import { buildTabRows, type NavGlyphName } from './navRows';
import { DESKTOP_BREAKPOINT } from './Shell';
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

/** The mockup's `.tab svg`: 22px, stroke 1.5, round caps and joins. */
const TAB_GLYPH_SIZE = 22;
const TAB_GLYPH_STROKE = 1.5;

const TAB_GLYPHS: Record<NavGlyphName, (props: GlyphProps) => React.ReactNode> = {
  bookOpen: (props) => <BookOpenGlyph {...props} />,
  shelves: (props) => <ShelvesGlyph {...props} />,
  bookmark: (props) => <BookmarkGlyph {...props} />,
  gear: (props) => <GearGlyph {...props} />,
};

export function TabBar({ state, navigation }: TabBarProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (width >= DESKTOP_BREAKPOINT) return null;

  const rows = buildTabRows(state.routes);

  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, styles.bar.paddingBottom as number) },
      ]}
    >
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
            // react-native-web 0.21 dropped the `accessibilityState` ->
            // `aria-*` mapping (lane C's LevelScale finding, repo-wide), so
            // without this the DOM tab never reports which one is current.
            // `accessibilityState` stays for native.
            aria-selected={focused}
            accessibilityState={{ selected: focused }}
            style={[styles.tab, webCursor]}
          >
            {row.glyph
              ? TAB_GLYPHS[row.glyph]({
                  color,
                  size: TAB_GLYPH_SIZE,
                  strokeWidth: TAB_GLYPH_STROKE,
                })
              : null}
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
      paddingTop: 10,
      paddingHorizontal: space.sm,
      paddingBottom: 22,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      minHeight: space.tapTarget,
    },
  });
}
