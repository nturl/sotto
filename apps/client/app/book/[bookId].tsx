import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { Cover } from '../../src/ui/Cover';
import { useLibrary } from '../../src/ui/data';
import { PlayGlyph, WaveformGlyph } from '../../src/ui/Glyphs';
import { MetaStrip } from '../../src/ui/MetaStrip';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';

export default function BookDetailScreen() {
  const t = useT();
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const library = useLibrary();
  const book = library.byId(typeof bookId === 'string' ? bookId : '');

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

      <View style={styles.actions}>
        <Button
          title={book.progress > 0 ? t('book.continue') : t('book.read')}
          icon={<PlayGlyph size={16} color={colors.surface} />}
          accessibilityLabel={book.progress > 0 ? t('book.continue') : t('book.read')}
          onPress={() => router.push(`/reader/${book.id}`)}
        />
        <Button
          variant="secondary"
          title={t('book.voiceMode')}
          icon={<WaveformGlyph size={16} />}
          onPress={() => router.push(`/voice/${book.id}`)}
        />
      </View>
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
});
