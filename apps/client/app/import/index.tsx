/**
 * Import a book — entry, pick-a-file, and preview (planning/design/
 * IMPORT.md §1-3). One screen with internal step state per the task
 * brief's file list (index.tsx covers "entry + file pick + preview");
 * app/import/[jobId].tsx is the progress screen this pushes into.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { ChevronRightGlyph } from '../../src/ui/Glyphs';
import { LEARNING_LANGUAGES, localizedName } from '../../src/ui/languages';
import { OptionRow } from '../../src/ui/OptionRow';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import { webCursor, withAlpha } from '../../src/ui/tokens';
import { fetchHealth, serverUrl, type Health } from '../../src/state/contentApi';
import { usePreferences } from '../../src/ui/data';
import { startImportJob } from '../../src/import/api';
import { canImportLocally } from '../../src/import/canImportLocally';
import { pickImportFile, type PickedFile } from '../../src/import/pickFile';
import { buildPreview, ImportError, type ImportPreview } from '../../src/import/preview';
import { useCloud } from '../../src/cloud/provider';
import { useMe } from '../../src/cloud/useMe';

type Step = 'pick' | 'preview' | 'failure' | 'hostedQueued';
type FailureKind = 'drm' | 'unsupported' | 'modelsDown' | 'localOnly';

export default function ImportEntryScreen() {
  const t = useT();
  const router = useRouter();
  const preferences = usePreferences();
  const cloud = useCloud();
  const me = useMe();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Finding 5 (adversarial review 3): serverUrl() silently resolves to the
  // page's own origin on a static web deploy, which would upload the
  // learner's file off-device to a host that never processes it. Only
  // start a *local* import when that URL is genuinely loopback, or the
  // caller explicitly configured a non-default server (EXPO_PUBLIC_SERVER_URL).
  const localImportAllowed = canImportLocally(serverUrl(), Boolean(process.env.EXPO_PUBLIC_SERVER_URL));
  const hostedAvailable =
    cloud.enabled &&
    me.status === 'signed-in' &&
    me.me.entitlement.importBooksCap - me.me.entitlement.importsUsed > 0;

  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [locale, setLocale] = useState<string>(preferences.learningLocale);
  const [localeSheetOpen, setLocaleSheetOpen] = useState(false);
  const [failure, setFailure] = useState<{ kind: FailureKind; service?: string } | null>(null);
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetchHealth().then(setHealth);
  }, []);

  const pick = async (): Promise<void> => {
    const picked = await pickImportFile();
    if (!picked) return;
    try {
      const built = buildPreview(picked);
      setFile(picked);
      setPreview(built);
      setLocale(built.detectedLocale);
      setStep('preview');
    } catch (err) {
      if (err instanceof ImportError && err.code === 'drm') {
        setFailure({ kind: 'drm' });
      } else {
        setFailure({ kind: 'unsupported' });
      }
      setStep('failure');
    }
  };

  const startHostedImport = async (): Promise<void> => {
    if (!file) return;
    setSubmitting(true);
    try {
      const blob = new Blob([file.bytes as unknown as BlobPart]);
      await cloud.importBook(blob, { bookTitle: file.filename, sourceLocale: locale });
      setStep('hostedQueued');
    } catch {
      setFailure({ kind: 'unsupported' });
      setStep('failure');
    } finally {
      setSubmitting(false);
    }
  };

  const startImport = async (): Promise<void> => {
    if (!file) return;
    if (!localImportAllowed) {
      if (hostedAvailable) {
        await startHostedImport();
      } else {
        setFailure({ kind: 'localOnly' });
        setStep('failure');
      }
      return;
    }
    const missing = health ? (['stt', 'llm', 'tts'] as const).find((k) => !health[k]) : 'server';
    if (!health || missing) {
      setFailure({ kind: 'modelsDown', service: typeof missing === 'string' ? missing : 'server' });
      setStep('failure');
      return;
    }
    setSubmitting(true);
    try {
      const result = await startImportJob(file, {
        locale,
        narrate: 'first',
        level: preferences.level,
      });
      if (!result.jobId) {
        if (result.error === 'drm') {
          setFailure({ kind: 'drm' });
        } else {
          setFailure({ kind: 'unsupported' });
        }
        setStep('failure');
        return;
      }
      router.replace(`/import/${result.jobId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const retryToPick = (): void => {
    setFailure(null);
    setFile(null);
    setPreview(null);
    setStep('pick');
  };

  if (step === 'hostedQueued') {
    return (
      <Shell>
        <View style={styles.failureWrap}>
          <Card style={styles.failureCard}>
            <Text role="heading" size={20} style={styles.center}>
              {t('import.hosted.queued.heading')}
            </Text>
            <Text role="caption" color="ink2" style={styles.center}>
              {t('import.hosted.queued.body')}
            </Text>
            <Button
              variant="secondary"
              title={t('common.continue')}
              onPress={() => router.replace('/(tabs)/library')}
            />
          </Card>
        </View>
      </Shell>
    );
  }

  if (step === 'failure' && failure) {
    return (
      <Shell>
        {failure.kind !== 'modelsDown' ? <BackLink /> : null}
        <View style={styles.failureWrap}>
          <Card style={styles.failureCard}>
            <Text role="heading" size={20} style={styles.center}>
              {t(`import.failure.${failure.kind}.heading` as const)}
            </Text>
            <Text role="ui" size={16} color="warn" style={styles.center}>
              {t(
                `import.failure.${failure.kind}.warn` as const,
                failure.service ? { service: failure.service } : undefined,
              )}
            </Text>
            <Text role="caption" color="ink2" style={styles.center}>
              {t(`import.failure.${failure.kind}.hint` as const)}
            </Text>
            <Button
              variant="secondary"
              title={
                failure.kind === 'modelsDown'
                  ? t('import.failure.retry')
                  : t('import.failure.chooseAnother')
              }
              onPress={() => {
                if (failure.kind === 'modelsDown') {
                  void fetchHealth().then(setHealth);
                  setFailure(null);
                  setStep(file ? 'preview' : 'pick');
                } else {
                  retryToPick();
                }
              }}
            />
          </Card>
        </View>
      </Shell>
    );
  }

  if (step === 'preview' && preview && file) {
    return (
      <Shell>
        <BackLink onPress={retryToPick} />
        <Text role="display" size={28} style={styles.title}>
          {t('import.preview.title')}
        </Text>

        <View style={styles.previewColumn}>
          <Card style={styles.surface2Card}>
            <Text role="ui" size={15} numberOfLines={1}>
              {file.filename}
            </Text>
          </Card>

          <Card>
            <View style={styles.detectedRow}>
              <View>
                <Text role="caption" color="ink2">
                  {t('import.preview.detectedLanguage')}
                </Text>
                <Text role="reading" size={17}>
                  {localizedName(
                    LEARNING_LANGUAGES.find((l) => l.code === locale) ?? {
                      code: locale,
                      nativeName: locale,
                      localizedNames: {},
                    },
                  )}
                </Text>
              </View>
              <Pressable
                onPress={() => setLocaleSheetOpen(true)}
                accessibilityRole="button"
                style={webCursor}
              >
                <Text role="uiButton" size={15} color="accent">
                  {t('import.preview.modify')}
                </Text>
              </Pressable>
            </View>
          </Card>

          <Card style={styles.surface2Card}>
            <View style={styles.statsRow}>
              <Text role="mono">
                {t('import.preview.chapters', { count: preview.chapterCount })}
              </Text>
              <View style={styles.statDivider} />
              <Text role="mono">{t('import.preview.words', { count: preview.wordCount })}</Text>
              <View style={styles.statDivider} />
              <Text role="mono">
                {t('import.preview.minutesPerChapter', {
                  count: preview.estimatedMinutesPerChapter,
                })}
              </Text>
            </View>
          </Card>
          <Text role="caption" color="ink3">
            {t('import.preview.estimateNote')}
          </Text>

          <Card style={styles.surface2Card}>
            <Text role="caption" color="ink2" style={styles.disclosure}>
              {t('import.preview.disclosure')}
            </Text>
          </Card>

          <Button
            title={t('import.preview.cta')}
            onPress={() => void startImport()}
            disabled={submitting}
          />
        </View>

        {localeSheetOpen ? (
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setLocaleSheetOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetList}>
                {LEARNING_LANGUAGES.map((option) => (
                  <OptionRow
                    key={option.code}
                    nativeName={option.nativeName}
                    localizedName={localizedName(option)}
                    selected={option.code === locale}
                    onPress={() => {
                      setLocale(option.code);
                      setLocaleSheetOpen(false);
                    }}
                  />
                ))}
              </View>
            </Pressable>
          </Pressable>
        ) : null}
      </Shell>
    );
  }

  return (
    <Shell>
      <BackLink />
      <Text role="display" size={28} style={styles.title}>
        {t('import.pickFile.title')}
      </Text>

      <View style={styles.formatList}>
        <FormatRow
          mono={t('import.pickFile.epubLabel')}
          body={t('import.pickFile.epubDesc')}
          onPress={() => void pick()}
        />
        <FormatRow
          mono={t('import.pickFile.txtLabel')}
          body={t('import.pickFile.txtDesc')}
          onPress={() => void pick()}
        />
        <FormatRow
          mono={t('import.pickFile.mdLabel')}
          body={t('import.pickFile.mdDesc')}
          onPress={() => void pick()}
        />
        <FormatRow
          mono={t('import.pickFile.pdfLabel')}
          body={t('import.pickFile.pdfDesc')}
          disabled
        />
      </View>
      <Text role="caption" color="ink3" style={styles.drmNote}>
        {t('import.pickFile.drmNote')}
      </Text>
    </Shell>
  );
}

function FormatRow({
  mono,
  body,
  onPress,
  disabled,
}: {
  mono: string;
  body: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View>
        <Text role="mono">{mono}</Text>
        <Text role="ui" size={16} color={disabled ? 'ink3' : 'ink'}>
          {body}
        </Text>
      </View>
      {!disabled ? <ChevronRightGlyph size={12} color={colors.ink2} /> : null}
    </View>
  );
  if (disabled) {
    return (
      <Card style={{ opacity: 0.6 }}>
        <View accessibilityState={{ disabled: true }}>{content}</View>
      </Card>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={webCursor}>
      <Card>{content}</Card>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    title: {
      marginTop: space.sm,
      marginBottom: space.xl,
    },
    formatList: {
      gap: space.md,
    },
    drmNote: {
      marginTop: space.lg,
    },
    previewColumn: {
      gap: space.md,
      maxWidth: 480,
    },
    surface2Card: {
      backgroundColor: colors.surface2,
    },
    detectedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    statDivider: {
      width: 1,
      height: 12,
      backgroundColor: colors.hairline,
    },
    disclosure: {
      lineHeight: 20,
    },
    sheetList: {
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
      maxHeight: 420,
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
      padding: space.lg,
      width: '100%',
      maxWidth: 400,
    },
    failureWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    failureCard: {
      gap: space.lg,
      maxWidth: 420,
      alignItems: 'center',
    },
    center: {
      textAlign: 'center',
    },
  });
}
