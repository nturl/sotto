import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { buildExport, parseImport, type TutorMode, type UserPreferences } from '@sotto/core';
import { colors, radius, space } from '@sotto/core/theme';
import { exportJson, importJson } from '../src/platform/importExport';
import { useT } from '../src/i18n/useT';
import { BackLink } from '../src/ui/BackLink';
import { Button } from '../src/ui/Button';
import { resetAll, setPreference, usePreferences } from '../src/ui/data';
import { ChevronRightGlyph } from '../src/ui/Glyphs';
import { languageNameFor } from '../src/ui/languages';
import { SectionEyebrow } from '../src/ui/SectionEyebrow';
import { Shell } from '../src/ui/Shell';
import { Text } from '../src/ui/Text';
import { Toast } from '../src/ui/Toast';
import { webCursor, withAlpha } from '../src/ui/tokens';
import { useSottoStore } from '../src/state/store';

const NARRATION_SPEEDS: UserPreferences['narrationSpeed'][] = [0.75, 1, 1.25];
const CORRECTION_FREQUENCIES: UserPreferences['correctionFrequency'][] = ['low', 'normal', 'high'];
const SPEAKING_PACES: UserPreferences['speakingPace'][] = ['slow', 'normal'];
const TUTOR_MODES: TutorMode[] = ['read_to_me', 'read_with_me', 'pronunciation', 'discuss'];

function cycle<T>(values: readonly T[], current: T): T {
  const idx = values.indexOf(current);
  return values[(idx + 1) % values.length]!;
}

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
        {spec.onPress && !spec.destructive ? (
          <ChevronRightGlyph size={12} color={colors.ink2} />
        ) : null}
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

  const exportNow = async () => {
    const state = useSottoStore.getState();
    const file = buildExport({
      preferences: state.preferences,
      progress: Object.values(state.progress),
      savedWords: state.savedWords,
      completedBooks: state.completedBooks,
      sessions: state.sessionRecord ? [state.sessionRecord] : [],
    });
    try {
      await exportJson('sotto-export.json', JSON.stringify(file, null, 2));
    } catch {
      setToast(t('settings.export.failed'));
    }
  };

  const importNow = async () => {
    try {
      const raw = await importJson();
      if (!raw) return;
      const result = parseImport(JSON.parse(raw));
      if (!result.ok) {
        setToast(
          t(
            result.error === 'import.unsupportedVersion'
              ? 'import.unsupportedVersion'
              : 'import.invalid',
          ),
        );
        return;
      }
      useSottoStore.getState().replaceUserData({
        preferences: result.data.preferences,
        progress: result.data.progress,
        savedWords: result.data.savedWords,
        completedBooks: result.data.completedBooks,
      });
      setToast(t('settings.import.done'));
    } catch {
      setToast(t('import.invalid'));
    }
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
            {
              label: t('settings.narrationSpeed'),
              value: `${preferences.narrationSpeed}x`,
              onPress: () =>
                setPreference(
                  'narrationSpeed',
                  cycle(NARRATION_SPEEDS, preferences.narrationSpeed),
                ),
            },
            {
              label: t('settings.captions'),
              value: preferences.captionsEnabled
                ? t('settings.captions.on')
                : t('settings.captions.off'),
              onPress: () => setPreference('captionsEnabled', !preferences.captionsEnabled),
            },
            {
              label: t('settings.turnDetection'),
              value: t(`settings.turnDetection.${preferences.turnDetection}` as const),
              onPress: () =>
                setPreference(
                  'turnDetection',
                  preferences.turnDetection === 'auto' ? 'push' : 'auto',
                ),
            },
            {
              label: t('settings.correctionFrequency'),
              value: t(`settings.correctionFrequency.${preferences.correctionFrequency}` as const),
              onPress: () =>
                setPreference(
                  'correctionFrequency',
                  cycle(CORRECTION_FREQUENCIES, preferences.correctionFrequency),
                ),
            },
            {
              label: t('settings.speakingPace'),
              value: t(`settings.speakingPace.${preferences.speakingPace}` as const),
              onPress: () =>
                setPreference('speakingPace', cycle(SPEAKING_PACES, preferences.speakingPace)),
            },
            {
              label: t('settings.defaultTutorMode'),
              value: t(`voice.mode.${preferences.defaultTutorMode}` as const),
              onPress: () =>
                setPreference('defaultTutorMode', cycle(TUTOR_MODES, preferences.defaultTutorMode)),
            },
          ]}
        />
        <Group
          eyebrow={t('settings.group.data')}
          rows={[
            { label: t('settings.export'), onPress: () => void exportNow() },
            { label: t('settings.import'), onPress: () => void importNow() },
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
              <Button
                variant="secondary"
                title={t('common.cancel')}
                onPress={() => setConfirmReset(false)}
                style={styles.modalButton}
              />
              <Button
                title={t('settings.reset')}
                onPress={confirmResetNow}
                style={styles.modalButton}
              />
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
