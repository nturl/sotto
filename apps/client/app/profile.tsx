import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { colors, radius, space } from '@sotto/core/theme';
import { useT } from '../src/i18n/useT';
import { BackLink } from '../src/ui/BackLink';
import { Button } from '../src/ui/Button';
import { resetAll, usePreferences } from '../src/ui/data';
import { ChevronRightGlyph } from '../src/ui/Glyphs';
import { languageNameFor } from '../src/ui/languages';
import { SectionEyebrow } from '../src/ui/SectionEyebrow';
import { Shell } from '../src/ui/Shell';
import { Text } from '../src/ui/Text';
import { Toast } from '../src/ui/Toast';
import { webCursor, withAlpha } from '../src/ui/tokens';

type RowSpec = {
  label: string;
  value?: string;
  destructive?: boolean;
  onPress?: () => void;
};

function Row({ spec, last }: { spec: RowSpec; last: boolean }) {
  const content = (
    <>
      <Text role="ui" size={15}>
        {spec.label}
      </Text>
      <View style={styles.rowValue}>
        {spec.value ? (
          <Text role="caption" size={14} color={spec.destructive ? 'warn' : 'ink2'}>
            {spec.value}
          </Text>
        ) : null}
        {spec.onPress && !spec.destructive ? <ChevronRightGlyph size={12} color={colors.ink2} /> : null}
      </View>
    </>
  );
  const rowStyle = [styles.row, !last && styles.rowDivider];
  if (!spec.onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={spec.onPress}
      accessibilityRole="button"
      accessibilityLabel={spec.label}
      style={[rowStyle, webCursor]}
    >
      {content}
    </Pressable>
  );
}

function Group({ eyebrow, rows }: { eyebrow: string; rows: RowSpec[] }) {
  return (
    <View style={styles.group}>
      <SectionEyebrow style={styles.eyebrow}>{eyebrow}</SectionEyebrow>
      <View style={styles.groupCard}>
        {rows.map((row, index) => (
          <Row key={row.label} spec={row} last={index === rows.length - 1} />
        ))}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const t = useT();
  const router = useRouter();
  const preferences = usePreferences();
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const soon = () => setToast(t('settings.comingSoon'));
  const go = (href: Href) => () => router.push(href);

  const confirmResetNow = () => {
    setConfirmReset(false);
    resetAll();
    setToast(t('settings.reset.done'));
  };

  return (
    <Shell>
      <BackLink />

      <View style={styles.groups}>
        <Group
          eyebrow={t('settings.group.languages')}
          rows={[
            {
              label: t('onboarding.step.learning'),
              value: languageNameFor(preferences.learningLocale),
              onPress: go('/settings/learning-language'),
            },
            {
              label: t('onboarding.step.explainIn'),
              value: languageNameFor(preferences.explanationLocale),
              onPress: go('/settings/explanation-language'),
            },
            {
              label: t('onboarding.step.appLanguage'),
              value: languageNameFor(preferences.interfaceLocale),
              onPress: go('/settings/app-language'),
            },
          ]}
        />
        <Group
          eyebrow={t('settings.group.tutor')}
          rows={[
            { label: t('settings.narrationSpeed'), value: t('settings.speed.normal'), onPress: soon },
            { label: t('settings.captions'), value: t('settings.captions.on'), onPress: soon },
          ]}
        />
        <Group
          eyebrow={t('settings.group.data')}
          rows={[
            { label: t('settings.export'), onPress: soon },
            { label: t('settings.import'), onPress: soon },
            {
              label: t('settings.reset'),
              value: t('settings.reset'),
              destructive: true,
              onPress: () => setConfirmReset(true),
            },
          ]}
        />
        <Group
          eyebrow={t('settings.group.about')}
          rows={[
            { label: t('settings.privacy'), onPress: soon },
            { label: t('settings.terms'), onPress: soon },
            { label: t('settings.feedback'), onPress: soon },
            { label: t('settings.licenses'), onPress: go('/settings/licenses') },
          ]}
        />
      </View>

      {confirmReset ? (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text role="heading" style={styles.modalTitle}>
              {t('settings.reset.title')}
            </Text>
            <Text role="ui" size={14} color="ink2" style={styles.modalBody}>
              {t('settings.reset.body')}
            </Text>
            <View style={styles.modalActions}>
              <Button variant="secondary" title={t('common.cancel')} onPress={() => setConfirmReset(false)} style={styles.modalButton} />
              <Button title={t('settings.reset')} onPress={confirmResetNow} style={styles.modalButton} />
            </View>
          </View>
        </View>
      ) : null}

      <Toast message={toast} onHide={() => setToast(null)} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  groups: {
    marginTop: space.lg,
    gap: space.gutter.phone,
  },
  group: {
    gap: 10,
  },
  eyebrow: {
    marginLeft: space.xs,
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    minHeight: space.tapTarget,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: withAlpha(colors.ink, 0.32),
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    zIndex: 20,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.xl,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    marginBottom: space.sm,
  },
  modalBody: {
    marginBottom: space.xl,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
  },
});
