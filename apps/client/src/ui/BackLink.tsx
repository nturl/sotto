/**
 * BackLink — "Retour" in accent ui 500 with a chevron (DESIGN.md detail
 * screens; one of the two sanctioned accent uses beyond CTA/active-tab).
 */
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, space } from '@sotto/core/theme';
import { useT } from '../i18n/useT';
import { BackGlyph } from './Glyphs';
import { Text } from './Text';
import { webCursor } from './tokens';

export function BackLink({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const t = useT();
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
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
