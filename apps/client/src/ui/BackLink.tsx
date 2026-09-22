/**
 * BackLink — "Retour" in accent ui 500 with a chevron (DESIGN.md detail
 * screens; one of the two sanctioned accent uses beyond CTA/active-tab).
 */
import { Pressable, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { space } from '@sotto/core/theme';
import { themeColors as colors } from './theme';
import { useT } from '../i18n/useT';
import { BackGlyph } from './Glyphs';
import { goBackOr } from './goBackOr';
import { Text } from './Text';
import { webCursor } from './tokens';

/** `fallback` is where Back goes when there is no history to pop — every
 * detail screen here is a shareable URL someone can cold-load. */
export function BackLink({
  onPress,
  fallback = '/(tabs)/home',
}: {
  onPress?: () => void;
  fallback?: Href;
}) {
  const router = useRouter();
  const t = useT();
  return (
    <Pressable
      onPress={onPress ?? (() => goBackOr(router, fallback))}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={space.sm}
      style={[styles.link, webCursor]}
    >
      <BackGlyph size={14} color={colors.accent} />
      <Text role="uiButton" size={15} color="accent">
        {t('common.back')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    minHeight: space.tapTarget,
  },
});
