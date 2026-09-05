import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { themeColors as colors } from '../../src/ui/theme';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { Cover } from '../../src/ui/Cover';
import { useLibrary } from '../../src/ui/data';
import { PlayGlyph, WaveformGlyph } from '../../src/ui/Glyphs';
import { MetaStrip } from '../../src/ui/MetaStrip';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';

export default function BookDetailScreen() {
  const t = useT();
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const library = useLibrary();
  const book = library.byId(typeof bookId === 'string' ? bookId : '');
  const { isDesktop } = useLayoutMetrics();

  if (!book) {
    return (
      <Shell>
        <BackLink />
        <Text role="caption" color="ink3" style={styles.notFound}>
          {t('book.notFound')}
        </Text>
      </Shell>
    );
  }

  const readLabel = book.progress > 0 ? t('book.continue') : t('book.read');
  const actions = (
    <View style={isDesktop ? styles.actionsDesktop : styles.actions}>
      <Button
        title={readLabel}
        icon={<PlayGlyph size={16} color={colors.surface} />}
        accessibilityLabel={readLabel}
        onPress={() => router.push(`/reader/${book.id}`)}
      />
      <Button
        variant="secondary"
        title={t('book.voiceMode')}
        icon={<WaveformGlyph size={16} />}
        onPress={() => router.push(`/voice/${book.id}`)}
      />
    </View>
  );

  // DESKTOP.md §4: two columns, not the phone's stacked/centered column —
  // 280px fixed cover column beside a left-aligned text column (measure
  // capped ~65ch / 600px), 48px gap, top-aligned. The CTAs hug the text
  // column's own width (max 400) rather than the full content region.
  if (isDesktop) {
    return (
      <Shell>
        <BackLink />
        <View style={styles.desktopRow}>
          <View style={styles.desktopCoverCol}>
            <Cover
              art={book.cover}
              width={280}
              height={420}
              cutout
              svgUrl={book.svgUrl}
              accessibilityLabel={book.title}
            />
          </View>
          <View style={styles.desktopTextCol}>
            <Text role="display" size={34}>
              {book.title}
            </Text>
            <Text role="ui" size={15} color="ink2" style={styles.desktopAuthor}>
              {book.author}
            </Text>
            <Text role="caption" color="ink3" style={styles.desktopSimplified}>
              {t('book.simplified')}
            </Text>
            <View style={styles.desktopMetaWrap}>
              <MetaStrip minutes={book.minutes} level={book.level} />
            </View>
            <Text role="heading" style={styles.insideTitle}>
              {t('book.inside')}
            </Text>
            <Text role="ui" size={15} style={styles.synopsis}>
              {book.synopsis}
            </Text>
            <Text role="caption" color="ink3" style={styles.disclaimer}>
              {t('book.disclaimer')}
            </Text>
            {actions}
          </View>
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <BackLink />

      <View style={styles.coverWrap}>
        <Cover
          art={book.cover}
          width={180}
          height={270}
          cutout
          svgUrl={book.svgUrl}
          accessibilityLabel={book.title}
        />
      </View>

      <Text role="display" size={30} style={styles.title}>
        {book.title}
      </Text>
      <Text role="ui" size={15} color="ink2" style={styles.center}>
        {book.author}
      </Text>
      <Text role="caption" color="ink3" style={[styles.center, styles.subtitle]}>
        {t('book.simplified')}
      </Text>

      <View style={styles.metaWrap}>
        <MetaStrip minutes={book.minutes} level={book.level} />
      </View>

      <Text role="heading" style={styles.insideTitle}>
        {t('book.inside')}
      </Text>
      <Text role="ui" size={15} style={styles.synopsis}>
        {book.synopsis}
      </Text>
      <Text role="caption" color="ink3" style={styles.disclaimer}>
        {t('book.disclaimer')}
      </Text>

      {actions}
    </Shell>
  );
}

const styles = StyleSheet.create({
  coverWrap: {
    alignItems: 'center',
    marginTop: space.lg,
    marginBottom: space.gutter.phone,
  },
  title: {
    textAlign: 'center',
    marginBottom: space.xs,
  },
  center: {
    textAlign: 'center',
  },
  subtitle: {
    marginTop: space.xs,
    marginBottom: 18,
  },
  metaWrap: {
    alignItems: 'center',
    marginBottom: space.gutter.phone,
  },
  insideTitle: {
    marginBottom: space.sm,
  },
  synopsis: {
    lineHeight: 22,
    marginBottom: space.sm,
  },
  disclaimer: {
    marginBottom: space.gutter.phone,
  },
  actions: {
    gap: 10,
    marginTop: 18,
  },
  notFound: {
    marginTop: space.xxxl,
    textAlign: 'center',
  },
  desktopRow: {
    flexDirection: 'row',
    gap: 48,
    alignItems: 'flex-start',
    marginTop: space.lg,
  },
  desktopCoverCol: {
    width: 280,
  },
  desktopTextCol: {
    flex: 1,
    maxWidth: 600,
  },
  desktopAuthor: {
    marginTop: space.xs,
  },
  desktopSimplified: {
    marginTop: space.xs,
    marginBottom: 18,
  },
  desktopMetaWrap: {
    alignItems: 'flex-start',
    marginBottom: space.gutter.phone,
  },
  actionsDesktop: {
    gap: 10,
    marginTop: 18,
    maxWidth: 400,
    alignSelf: 'stretch',
  },
});
