/**
 * DailyStoryCard — surface card, radius 10, with the one gradient allowed in
 * the system: a deep-teal -> sage panel on the left third holding the cover
 * (4px peach cutout). Mono eyebrow "HISTOIRE DU JOUR", live countdown to
 * local midnight in mono. The whole card is a cutout pressable (6px peach).
 *
 * The teal/sage values are theme tokens (`colors.dailyTeal` /
 * `colors.dailySage`) — the only permitted gradient in v1.
 */
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, shadow, space } from '@sotto/core/theme';
import { useT } from '../i18n/useT';
import { usePressAnimation } from './Button';
import { Cover } from './Cover';
import type { LibraryBook } from './data';
import { Defs, LinearGradient, Rect, Stop, Svg } from './svg';
import { SectionEyebrow } from './SectionEyebrow';
import { Text } from './Text';
import { webCursor } from './tokens';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** HH:MM:SS remaining until local midnight, ticking every second. */
function useMidnightCountdown(): string {
  const [label, setLabel] = useState('--:--:--');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const remaining = Math.max(0, midnight.getTime() - now.getTime());
      const hours = Math.floor(remaining / 3_600_000);
      const minutes = Math.floor((remaining % 3_600_000) / 60_000);
      const seconds = Math.floor((remaining % 60_000) / 1000);
      setLabel(`${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);
  return label;
}

export function DailyStoryCard({ book, onPress }: { book: LibraryBook; onPress: () => void }) {
  const t = useT();
  const countdown = useMidnightCountdown();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const animation = usePressAnimation(pressed || hovered);

  const faceTranslate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, shadow.cutoutPeach.offsetX - shadow.pressed.offsetX],
  });
  const shadowOffset = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [shadow.cutoutPeach.offsetX, shadow.pressed.offsetX],
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('home.dailyEyebrow')}: ${book.title}`}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={webCursor}
    >
      <View>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.cutout,
            { transform: [{ translateX: shadowOffset }, { translateY: shadowOffset }] },
          ]}
        />
        <Animated.View
          style={[
            styles.card,
            { transform: [{ translateX: faceTranslate }, { translateY: faceTranslate }] },
          ]}
        >
          <View style={styles.panel}>
            <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="daily-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={colors.dailyTeal} />
                  <Stop offset="100%" stopColor={colors.dailySage} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={100} height={100} fill="url(#daily-gradient)" />
            </Svg>
            <Cover
              art={book.cover}
              width={72}
              height={108}
              cutout
              cutoutSize={4}
              svgUrl={book.svgUrl}
              accessibilityLabel={book.title}
            />
          </View>
          <View style={styles.body}>
            <SectionEyebrow>{t('home.dailyEyebrow')}</SectionEyebrow>
            <Text role="heading" size={20} numberOfLines={1}>
              {book.title}
            </Text>
            <Text role="caption" size={12}>
              {t('home.dailyMeta', { minutes: book.minutes, level: book.level })}
            </Text>
            <Text role="mono">{countdown}</Text>
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cutout: {
    borderRadius: radius.md,
    backgroundColor: colors.peach,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    flexDirection: 'row',
  },
  panel: {
    width: '34%',
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.lg,
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space.lg,
    paddingHorizontal: 14,
    gap: 6,
  },
});
