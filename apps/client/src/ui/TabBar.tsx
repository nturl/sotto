/**
 * TabBar — phone tab bar (DESIGN.md navigation): surface bar with a top
 * hairline; active tab = accent icon + label at 500 weight, inactive ink-2.
 * Icons are 24px strokes: star (Pour toi), open book (Bibliothèque),
 * graduation cap (Vocabulaire). Hidden at >= 900px, where Shell renders the
 * sidebar instead.
 *
 * Props are typed structurally so we don't import @react-navigation types
 * (not a declared dependency of @sotto/client); the Tabs layout casts.
 */
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '@sotto/core/theme';
import { useT, type MessageKey } from '../i18n/useT';
import { fonts } from './fonts';
import { CapGlyph, OpenBookGlyph, StarGlyph } from './Glyphs';
import { Text } from './Text';
import { webCursor } from './tokens';

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
};

export function TabBar({ state, navigation }: TabBarProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const t = useT();

  if (width >= 900) return null;

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const color = focused ? colors.accent : colors.ink2;
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            style={[styles.tab, webCursor]}
          >
            {TAB_ICONS[route.name]?.({ color })}
            <Text
              role="caption"
              size={11}
              style={{ color, fontFamily: focused ? fonts.interMedium : fonts.interRegular }}
            >
              {t(`tabs.${route.name}` as MessageKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
