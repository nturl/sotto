/**
 * Settings hub (run 7, lane E: moved here from `app/profile.tsx`, which is
 * now a `/settings` redirect — see `app/profile.tsx`). Every existing
 * setting is kept; they are regrouped per the run-7 E card into Languages,
 * Reading, Tutor, Account, About.
 *
 * The Tutor group's own-provider row reads `ownProviderStatus`
 * (src/voice/ownProviderStatus.ts) instead of the R4-B2 `useState` +
 * one-time `hasByokKey()` read this screen used to do — that one-time read
 * was the root cause of the "saved but the toggle read off" defect: it only
 * ran on this screen's first mount, so saving the key on
 * `/settings/openai-key` and navigating back never refreshed it. The store
 * field is written by that screen and read here (and by TutorModelsPanel,
 * and the voice screen), so every reader updates in the same tick.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { buildExport, parseImport, type TutorMode, type UserPreferences } from '@sotto/core';
import { radius, space } from '@sotto/core/theme';
import { useCloud } from '../../src/cloud/provider';
import { useMe } from '../../src/cloud/useMe';
import { exportJson, importJson } from '../../src/platform/importExport';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { resetAll, setPreference, usePreferences } from '../../src/ui/data';
import { Group } from '../../src/ui/GroupList';
import { TrashGlyph } from '../../src/ui/Glyphs';
import { languageNameFor } from '../../src/ui/languages';
import { Sheet } from '../../src/ui/Sheet';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { Toast } from '../../src/ui/Toast';
import { useTheme } from '../../src/ui/theme';
import { webCursor, withAlpha } from '../../src/ui/tokens';
import { useSottoStore } from '../../src/state/store';
import { deleteAudioAssets } from '../../src/import/privateAudio';
import { useOwnProviderStatus } from '../../src/voice/ownProviderStatus';

const NARRATION_SPEEDS: UserPreferences['narrationSpeed'][] = [0.75, 1, 1.25];
const CORRECTION_FREQUENCIES: UserPreferences['correctionFrequency'][] = ['low', 'normal', 'high'];
const SPEAKING_PACES: UserPreferences['speakingPace'][] = ['slow', 'normal'];
const TUTOR_MODES: TutorMode[] = ['read_to_me', 'read_with_me', 'pronunciation', 'discuss'];

function cycle<T>(values: readonly T[], current: T): T {
  const idx = values.indexOf(current);
  return values[(idx + 1) % values.length]!;
}

export default function SettingsScreen() {
  const t = useT();
  const router = useRouter();
  const preferences = usePreferences();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // ACCOUNT.md §0: the account-status row only renders when a CloudAdapter
  // is present — absent (not disabled, not hidden-but-present) in the
  // OSS/NullCloud build.
  const cloud = useCloud();
  const me = useMe();
  const privateBooks = useSottoStore((s) => s.privateBooks);
  const [manageImportsOpen, setManageImportsOpen] = useState(false);

  // Run 7, lane E: single source of truth for the own-provider row, read by
  // this hub, TutorModelsPanel, and the voice screen alike — see
  // src/voice/ownProviderStatus.ts.
  const ownProviderStatus = useOwnProviderStatus();

  const soon = () => setToast(t('settings.comingSoon'));
  const go = (href: Href) => () => router.push(href);

  const deletePrivateBook = async (bookId: string) => {
    const book = await useSottoStore.getState().loadBook(bookId);
    const audioFiles = (book?.chapters ?? [])
      .filter((c) => c.audio)
      .map((c) => (c.audio as string).replace('audio/', ''));
    if (audioFiles.length > 0) {
      try {
        await deleteAudioAssets(bookId, audioFiles);
      } catch {
        // Best-effort — the book/chapter records are removed regardless.
      }
    }
    await useSottoStore.getState().removePrivateBook(bookId);
  };

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
        {cloud.enabled ? (
          <Group
            eyebrow={t('settings.group.account')}
            rows={[
              me.status === 'signed-in'
                ? {
                    label: me.me.user.email,
                    value:
                      me.me.entitlement.plan === 'free'
                        ? undefined
                        : t(`account.plan.${me.me.entitlement.plan}` as const),
                    onPress: go('/account'),
                  }
                : { label: t('account.signIn'), onPress: go('/account') },
              ...(me.status === 'signed-in'
                ? [{ label: t('account.usageRow'), onPress: go('/usage') }]
                : []),
            ]}
          />
        ) : null}
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
          eyebrow={t('settings.group.reading')}
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
              label: t('settings.scheme.title'),
              value: t(`settings.scheme.${preferences.colorScheme ?? 'system'}` as const),
              onPress: go('/settings/appearance'),
            },
          ]}
        />
        <Group
          eyebrow={t('settings.group.tutor')}
          rows={[
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
            {
              // Run 7, lane E: the mode selector row. Reads the single
              // ownProviderStatus source rather than a screen-local
              // useState, so it can never go stale the way the old
              // "use own provider" toggle did.
              label: t('settings.tutorMode'),
              value: t(`byok.status.${ownProviderStatus}` as const),
              onPress: go('/settings/openai-key'),
            },
            {
              label: t('tutor.browser.settingsRow'),
              onPress: go('/settings/models'),
            },
          ]}
        />
        <Group
          eyebrow={t('settings.group.data')}
          rows={[
            {
              label: t('import.profile.row'),
              value: String(privateBooks.length),
              onPress: () => setManageImportsOpen(true),
            },
            { label: t('settings.export'), onPress: () => void exportNow() },
            { label: t('settings.import'), onPress: () => void importNow() },
            {
              label: t('settings.reset'),
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

      <Sheet visible={manageImportsOpen}>
        <View style={styles.importsSheet}>
          <Text role="heading" size={18} style={styles.importsSheetTitle}>
            {t('import.profile.row')}
          </Text>
          {privateBooks.length === 0 ? (
            <Text role="caption" color="ink2">
              {t('import.profile.empty')}
            </Text>
          ) : (
            privateBooks.map((book) => (
              <View key={book.bookId} style={styles.importRow}>
                <Text role="ui" size={15} numberOfLines={1} style={styles.importRowTitle}>
                  {book.title}
                </Text>
                <Pressable
                  onPress={() => void deletePrivateBook(book.bookId)}
                  accessibilityRole="button"
                  accessibilityLabel={t('import.failure.chooseAnother')}
                  style={webCursor}
                >
                  <TrashGlyph size={18} color={colors.ink2} />
                </Pressable>
              </View>
            ))
          )}
          <Button
            variant="secondary"
            title={t('import.library.button')}
            onPress={() => {
              setManageImportsOpen(false);
              router.push('/import');
            }}
          />
        </View>
      </Sheet>

      <Toast message={toast} onHide={() => setToast(null)} />
    </Shell>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    groups: {
      marginTop: space.lg,
      gap: space.gutter.phone,
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
    importsSheet: {
      gap: space.md,
      paddingBottom: space.xl,
    },
    importsSheetTitle: {
      marginBottom: space.xs,
    },
    importRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    },
    importRowTitle: {
      flex: 1,
      marginRight: space.md,
    },
  });
}
