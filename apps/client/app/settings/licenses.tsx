import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { colors, space } from '@sotto/core/theme';
import { fetchAttribution, type Attribution } from '../../src/state/contentApi';
import { useT } from '../../src/i18n/useT';
type T = ReturnType<typeof useT>;
import { BackLink } from '../../src/ui/BackLink';
import { Card } from '../../src/ui/Card';
import { useLibrary, type LibraryBook } from '../../src/ui/data';
import { SectionEyebrow } from '../../src/ui/SectionEyebrow';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { webCursor } from '../../src/ui/tokens';

function LicenseRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Text role="ui" size={15} style={styles.rowLabel}>
        {label}
      </Text>
      <Text role="caption" style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

function LinkRow({ label, url, last }: { label: string; url: string; last?: boolean }) {
  return (
    <Pressable
      onPress={() => void Linking.openURL(url).catch(() => {})}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={[styles.row, !last && styles.rowDivider, webCursor]}
    >
      <Text role="ui" size={15} style={styles.rowLabel}>
        {label}
      </Text>
      <Text role="caption" color="ink2" style={styles.rowValue} numberOfLines={1}>
        {url}
      </Text>
    </Pressable>
  );
}

type AttributionState = Attribution | 'loading' | 'error';

/** Fetches each library book's attribution.json once (keyed by bookId, never refetched). */
function useAttributions(books: LibraryBook[]): Record<string, AttributionState> {
  const [state, setState] = useState<Record<string, AttributionState>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    for (const book of books) {
      if (!book.id || requested.current.has(book.id)) continue;
      requested.current.add(book.id);
      setState((prev) => ({ ...prev, [book.id]: 'loading' }));
      fetchAttribution(book.contentLocale, book.id)
        .then((attribution) => setState((prev) => ({ ...prev, [book.id]: attribution })))
        .catch(() => setState((prev) => ({ ...prev, [book.id]: 'error' })));
    }
  }, [books]);

  return state;
}

function BookLicenseCard({
  book,
  attribution,
  t,
}: {
  book: LibraryBook;
  attribution: AttributionState | undefined;
  t: T;
}) {
  return (
    <Card padding={0} style={styles.bookCard}>
      <View style={[styles.row, styles.rowDivider, styles.bookHeaderRow]}>
        <Text role="uiButton" size={15} style={styles.rowLabel}>
          {book.title} — {book.author}
        </Text>
        <Text role="caption" color="ink2">
          {t(`settings.licenses.reviewStatus.${book.reviewStatus}` as const)}
        </Text>
      </View>

      {attribution === undefined || attribution === 'loading' ? (
        <View style={styles.row}>
          <Text role="caption" color="ink2">
            {t('settings.licenses.loading')}
          </Text>
        </View>
      ) : attribution === 'error' ? (
        <View style={styles.row}>
          <Text role="caption" color="warn">
            {t('settings.licenses.loadFailed')}
          </Text>
        </View>
      ) : (
        <>
          <LicenseRow
            label={t('settings.licenses.originalAuthor')}
            value={attribution.text.author}
          />
          <LicenseRow
            label={t('settings.licenses.sourceEdition')}
            value={attribution.text.sourceEdition}
          />
          <LinkRow label={t('settings.licenses.sourceLink')} url={attribution.text.sourceUrl} />
          <LicenseRow
            label={t('settings.licenses.adaptationEditor')}
            value={attribution.text.adaptationEditor}
          />
          <LicenseRow
            label={t('settings.licenses.textLicense')}
            value={attribution.text.license.spdx}
          />
          <LicenseRow
            label={t('settings.licenses.coverLicense')}
            value={attribution.cover.license.spdx}
          />
          <LicenseRow
            label={t('settings.licenses.narrationLicense')}
            value={attribution.audio?.license.spdx ?? t('settings.licenses.noNarration')}
            last
          />
        </>
      )}
    </Card>
  );
}

export default function LicensesScreen() {
  const t = useT();
  const library = useLibrary();
  // `library.daily` is always one of `library.books` (picked by index), so
  // rendering `library.books` alone already covers it — no dedup needed.
  const books = library.books;
  const attributions = useAttributions(books);

  return (
    <Shell>
      <BackLink />
      <Text role="display" style={styles.title}>
        {t('settings.licenses')}
      </Text>
      <Text role="ui" size={14} color="ink2" style={styles.intro}>
        {t('settings.licenses.intro')}
      </Text>

      <Card padding={0} style={styles.card}>
        <LicenseRow label={t('settings.licenses.codeLabel')} value="Apache-2.0" />
        <LicenseRow label={t('settings.licenses.textLabel')} value="CC BY-SA 4.0" />
        <LicenseRow label={t('settings.licenses.kokoroCredit')} value="Apache-2.0" />
        <LicenseRow label={t('settings.licenses.sttCredit')} value="MIT" last />
      </Card>

      <SectionEyebrow style={styles.booksEyebrow}>{t('settings.licenses.books')}</SectionEyebrow>
      <View style={styles.books}>
        {books.map((book) => (
          <BookLicenseCard key={book.id} book={book} attribution={attributions[book.id]} t={t} />
        ))}
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: space.sm,
    marginBottom: space.lg,
  },
  intro: {
    marginBottom: space.xl,
  },
  card: {
    marginBottom: space.xl,
  },
  booksEyebrow: {
    marginBottom: 10,
    marginLeft: space.xs,
  },
  books: {
    gap: space.md,
  },
  bookCard: {
    marginBottom: 0,
  },
  bookHeaderRow: {
    flexWrap: 'wrap',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    minHeight: space.tapTarget,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowLabel: {
    flex: 1,
  },
  rowValue: {
    textAlign: 'right',
    flexShrink: 1,
  },
});
