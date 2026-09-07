/**
 * TodaysStorySpread — Home's "Today's story" (mockup `.spread`, frame 1 and
 * phone 1). Replaces run 7's `DailyStoryCard`, which was a gradient card:
 * APP-V2-SPEC's ban list has no gradients on surfaces, and PLAN decision 10
 * makes the daily book a spread with three destinations instead of one
 * whole-card press.
 *
 * A surface card, radius 10, hairline border. Left: a fixed 184 (phone 132)
 * surface-2 column with a hairline right edge holding the cover at 120x180
 * (phone 96x144) with the 6px peach cutout. Right: mono meta, the title in
 * the display face at 30 (phone 22), the synopsis (desktop only, the phone
 * frame drops it), and Read / Listen / About this book.
 *
 * The buttons are local rather than `Button` because the mockup's `.btn` is
 * its own size (13/18 padding, 15px label, phone 11/14 and 14) and because
 * PLAN decision 8 puts the CTA label in **ink** on the accent fill, where
 * `Button`'s primary still uses `surface`. They keep the system's cutout
 * press through `usePressAnimation`.
 *
 * The v1 countdown is gone (APP-V2-SPEC "Don't": no countdown on the daily
 * story); "Changes at midnight" is a static mono line in the rail head,
 * which Home renders.
 */
import { useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { radius, shadow, space } from '@sotto/core/theme';
import { useT } from '../i18n/useT';
import { usePressAnimation } from './Button';
import { Cover } from './Cover';
import type { LibraryBook } from './data';
import { languageNameFor } from './languages';
import { useLayoutMetrics } from './Shell';
import { Text } from './Text';
import { useTheme } from './theme';
import { webCursor } from './tokens';

type SpreadButtonVariant = 'cta' | 'sec' | 'ghost';

/** Mockup `.btn` / `.btn.cta` / `.btn.sec` / `.btn.ghost`, with the phone
 * overrides from `.pmain .btn`. The cta carries the 4px ink cutout that
 * presses down to 2px, the same device `Button` uses. */
function SpreadButton({
  label,
  onPress,
  variant,
  isDesktop,
}: {
  label: string;
  onPress: () => void;
  variant: SpreadButtonVariant;
  isDesktop: boolean;
}) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const engaged = pressed || hovered;
  const animation = usePressAnimation(engaged);
  const isCta = variant === 'cta';

  const faceTranslate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, shadow.cutoutInk.offsetX - shadow.pressed.offsetX],
  });
  const shadowOffset = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [shadow.cutoutInk.offsetX, shadow.pressed.offsetX],
  });
  const fade = animation.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] });

  const face =
    variant === 'sec'
      ? { backgroundColor: colors.surface2 }
      : isCta
        ? { backgroundColor: colors.accent }
        : { backgroundColor: 'transparent' };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={webCursor}
    >
      <View>
        {isCta ? (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.cutout,
              { backgroundColor: colors.ink },
              { transform: [{ translateX: shadowOffset }, { translateY: shadowOffset }] },
            ]}
          />
        ) : null}
        <Animated.View
          style={[
            styles.btn,
            isDesktop ? styles.btnDesktop : styles.btnPhone,
            variant === 'ghost' && styles.btnGhost,
            face,
            isCta
              ? { transform: [{ translateX: faceTranslate }, { translateY: faceTranslate }] }
              : { opacity: fade },
          ]}
        >
          <Text
            role="uiButton"
            size={isDesktop ? 15 : 14}
            /* PLAN decision 8: ink on the accent fill (5:1), not cream
             * (3.45:1). Ghost is the mockup's ink-2 text link. */
            color={variant === 'ghost' ? 'ink2' : 'ink'}
          >
            {label}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

export type TodaysStorySpreadProps = {
  book: LibraryBook;
  onRead: () => void;
  onListen: () => void;
  onAbout: () => void;
};

export function TodaysStorySpread({ book, onRead, onListen, onAbout }: TodaysStorySpreadProps) {
  const t = useT();
  const { colors } = useTheme();
  const { isDesktop } = useLayoutMetrics();
  const themed = useMemo(() => createStyles(colors), [colors]);

  const coverWidth = isDesktop ? 120 : 96;
  const coverHeight = isDesktop ? 180 : 144;

  // Desktop carries the language; the phone frame's `.meta` drops it for
  // room ("7 min · A1").
  const meta = isDesktop
    ? t('home.today.meta', {
        minutes: book.minutes,
        level: book.level,
        language: languageNameFor(book.contentLocale),
      })
    : t('home.dailyMeta', { minutes: book.minutes, level: book.level });

  return (
    <View style={[styles.spread, themed.spread]}>
      <View style={[styles.left, themed.left, isDesktop ? styles.leftDesktop : styles.leftPhone]}>
        <Cover
          book={book}
          width={coverWidth}
          height={coverHeight}
          cutout
          accessibilityLabel={book.title}
        />
      </View>
      <View style={[styles.right, isDesktop ? styles.rightDesktop : styles.rightPhone]}>
        <Text role="mono" color="ink2" style={styles.meta}>
          {meta}
        </Text>
        <Text role="display" size={isDesktop ? 30 : 22} numberOfLines={2} style={styles.title}>
          {book.title}
        </Text>
        {isDesktop && book.synopsis ? (
          <Text role="ui" size={15} color="ink2" style={styles.synopsis}>
            {book.synopsis}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <SpreadButton
            label={t('book.read')}
            onPress={onRead}
            variant="cta"
            isDesktop={isDesktop}
          />
          <SpreadButton
            label={t('home.today.listen')}
            onPress={onListen}
            variant="sec"
            isDesktop={isDesktop}
          />
          {isDesktop ? (
            <SpreadButton
              label={t('home.today.about')}
              onPress={onAbout}
              variant="ghost"
              isDesktop={isDesktop}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  spread: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  left: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
  },
  // Mockup `.spread{grid-template-columns:184px 1fr}` / `.pmain .spread{132px}`.
  leftDesktop: {
    width: 184,
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  leftPhone: {
    width: 132,
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  right: {
    flex: 1,
    minWidth: 0,
  },
  rightDesktop: {
    paddingVertical: 28,
    paddingHorizontal: 32,
  },
  rightPhone: {
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  meta: {
    textTransform: 'uppercase',
  },
  title: {
    marginTop: space.sm,
    marginBottom: 6,
  },
  // The mockup caps the synopsis at 46ch. React Native has no `ch`, so this
  // is 46 characters of Inter 15 at its ~9px digit advance.
  synopsis: {
    maxWidth: 414,
    marginTop: 12,
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  cutout: {
    borderRadius: radius.md,
  },
  btn: {
    minHeight: space.tapTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDesktop: {
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  btnPhone: {
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  btnGhost: {
    paddingLeft: 6,
  },
});

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    spread: {
      backgroundColor: colors.surface,
      borderColor: colors.hairline,
    },
    left: {
      backgroundColor: colors.surface2,
      borderRightColor: colors.hairline,
    },
  });
}
