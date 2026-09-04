import { StyleSheet, View } from 'react-native';
import { colors, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Card } from '../../src/ui/Card';
import { useLibrary } from '../../src/ui/data';
import { SectionEyebrow } from '../../src/ui/SectionEyebrow';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';

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

export default function LicensesScreen() {
  const t = useT();
  const library = useLibrary();

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
        <LicenseRow label={t('settings.licenses.textLabel')} value="CC BY-SA 4.0" />
        <LicenseRow label={t('settings.licenses.audioLabel')} value="CC BY-SA 4.0 · Apache-2.0" />
        <LicenseRow label={t('settings.licenses.codeLabel')} value="Apache-2.0" last />
      </Card>

      <SectionEyebrow style={styles.booksEyebrow}>{t('settings.licenses.books')}</SectionEyebrow>
      <Card padding={0}>
        {[...library.books, library.daily].map((book, index, all) => (
          <LicenseRow
            key={book.id}
            label={`${book.title} — ${book.author}`}
            value="CC BY-SA 4.0"
            last={index === all.length - 1}
          />
        ))}
      </Card>
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
  },
});
