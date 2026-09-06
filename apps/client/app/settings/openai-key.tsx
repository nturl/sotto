/**
 * Settings > Your OpenAI key — the guided own-provider connect flow
 * (run 7, lane E; superseding the plain save/remove form from R4-B2).
 *
 * Reachable from the Settings hub's Tutor group and from `/voice/<bookId>`
 * (the voice screen links here when own-provider mode isn't connected yet).
 * Everything it does is still deliberately narrow — this lane does not touch
 * storage or validation, both cordoned to the Opus process:
 *  - the input is `secureTextEntry`, so the key is never rendered in clear
 *    text, and a key already stored is shown only as a mask (`maskKey`) —
 *    the screen never reads the stored value back into the field;
 *  - "Connect and use this key" validates against `GET /v1/models` before
 *    storing (R4-B1 phase 2, docs/evidence/byok-cors-2026-09-05.log: that's
 *    the one endpoint whose 401 a browser page can read) and, on success,
 *    stores AND selects own-provider mode in one action — there is no
 *    separate "now turn it on" step, which is what the "saved but the
 *    toggle read off" defect needed;
 *  - storage is byokKey.ts (localStorage on web, expo-secure-store on
 *    native) and never the Zustand persisted store, which Settings > Export
 *    writes to a file.
 *
 * `ownProviderStatus` (src/voice/ownProviderStatus.ts) is written only here
 * — connecting while validating, connected/invalid once the verdict is in,
 * disconnected on Remove. Every other screen (the hub row, TutorModelsPanel,
 * the voice screen) only reads it.
 */
import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { validateOpenAIKey } from '@sotto/voice';
import { radius, space } from '@sotto/core/theme';
import { useCloud } from '../../src/cloud/provider';
import { useT } from '../../src/i18n/useT';
import { useLibrary } from '../../src/ui/data';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { Toast } from '../../src/ui/Toast';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';
import { getByokKey, maskKey, removeByokKey, setByokKey } from '../../src/voice/byokKey';
import { setOwnProviderStatus, useOwnProviderStatus } from '../../src/voice/ownProviderStatus';

const PROVIDER_SETUP_URL = 'https://platform.openai.com/api-keys';
const DOCS_URL = 'https://github.com/nturl/sotto/blob/main/docs/byok.md';

export default function OpenAIKeyScreen() {
  const t = useT();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cloud = useCloud();
  const library = useLibrary();
  const status = useOwnProviderStatus();

  const [draft, setDraft] = useState('');
  const [stored, setStored] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Shows the connect form even when a key is already stored — the
  // "Replace" action re-opens it without first requiring Disconnect.
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // Only the mask is kept in component state; the raw value is read once
    // to produce it and then dropped. This also settles `ownProviderStatus`
    // for a cold start / direct link, since nothing else does that check.
    void getByokKey().then((key) => {
      setStored(key ? maskKey(key) : null);
      if (key) {
        if (status === 'disconnected') setOwnProviderStatus('connected');
      } else if (status !== 'invalid') {
        setOwnProviderStatus('disconnected');
      }
    });
    // Deliberately run once, on mount: this is the read this screen owns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testBookId = library.continueReading[0]?.id ?? library.books[0]?.id;

  const connect = async () => {
    const key = draft.trim();
    if (!key || busy) return;
    setBusy(true);
    setError(null);
    setOwnProviderStatus('connecting');
    const verdict = await validateOpenAIKey(key);
    if (!verdict.ok) {
      setBusy(false);
      setOwnProviderStatus('invalid');
      setError(verdict.reason === 'network' ? t('byok.networkError') : t('byok.invalid'));
      return;
    }
    await setByokKey(key);
    setStored(maskKey(key));
    setDraft('');
    setBusy(false);
    setEditing(false);
    setOwnProviderStatus('connected');
    setToast(t('byok.flow.connected'));
  };

  const disconnect = async () => {
    await removeByokKey();
    setStored(null);
    setDraft('');
    setError(null);
    setEditing(false);
    setOwnProviderStatus('disconnected');
    setToast(t('byok.removed'));
  };

  const testTheTutor = () => {
    if (testBookId) router.push(`/voice/${testBookId}`);
  };

  const showForm = editing || !stored;

  return (
    <Shell>
      <BackLink />
      <Text role="display" style={styles.title}>
        {t('byok.title')}
      </Text>

      {showForm ? (
        <>
          <Text role="ui" size={15} color="ink2" style={styles.intro}>
            {t('byok.flow.enables')}
          </Text>
          <Text role="caption" size={14} color="ink2" style={styles.intro}>
            {t('byok.flow.billing')}
          </Text>
          <Text
            role="caption"
            size={14}
            color="ink2"
            style={[styles.docsLink, webCursor]}
            onPress={() => void Linking.openURL(PROVIDER_SETUP_URL)}
            accessibilityRole="link"
          >
            {t('byok.flow.getKeyLink')}
          </Text>

          <View style={styles.card}>
            {stored ? (
              <Text role="ui" size={15} style={styles.stored} testID="byok-stored">
                {t('byok.stored', { masked: stored })}
              </Text>
            ) : null}
            <TextInput
              value={draft}
              onChangeText={setDraft}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder={t('byok.placeholder')}
              placeholderTextColor={colors.ink3}
              accessibilityLabel={t('byok.title')}
              testID="byok-input"
              style={styles.input}
            />
            {error ? (
              <Text role="caption" size={14} color="warn" testID="byok-error">
                {error}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button
                title={busy ? t('byok.checking') : t('byok.flow.connect')}
                onPress={() => void connect()}
                disabled={busy || !draft.trim()}
                accessibilityLabel={t('byok.flow.connect')}
                style={styles.action}
              />
              {stored ? (
                <Button
                  variant="secondary"
                  title={t('common.cancel')}
                  onPress={() => {
                    setEditing(false);
                    setDraft('');
                    setError(null);
                  }}
                  style={styles.action}
                />
              ) : null}
            </View>
          </View>
        </>
      ) : (
        <View style={styles.card} testID="byok-connected-summary">
          <Text role="ui" size={15} color="ink2" style={styles.stored} testID="byok-stored">
            {t('byok.stored', { masked: stored ?? '' })}
          </Text>
          <Text role="caption" size={14} color="ink2">
            {t(`byok.status.${status}` as const)}
          </Text>
          <View style={styles.actions}>
            <Button
              title={t('byok.flow.test')}
              onPress={testTheTutor}
              disabled={!testBookId}
              style={styles.action}
            />
          </View>
          <View style={styles.actions}>
            <Button
              variant="secondary"
              title={t('byok.flow.replace')}
              onPress={() => setEditing(true)}
              style={styles.action}
            />
            <Button
              variant="secondary"
              title={t('byok.flow.disconnect')}
              onPress={() => void disconnect()}
              accessibilityLabel={t('byok.flow.disconnect')}
              style={styles.action}
            />
          </View>
          <Text
            role="caption"
            size={14}
            color="ink2"
            style={[styles.docsLink, webCursor]}
            onPress={() => router.push('/settings/models')}
            accessibilityRole="link"
            testID="byok-switch"
          >
            {cloud.enabled ? t('byok.flow.switchWithPlan') : t('byok.flow.switch')}
          </Text>
        </View>
      )}

      <Text role="caption" size={14} color="ink2" style={styles.caption}>
        {t('byok.caption')}
      </Text>
      <Text
        role="caption"
        size={14}
        color="ink2"
        style={[styles.docsLink, webCursor]}
        onPress={() => void Linking.openURL(DOCS_URL)}
        accessibilityRole="link"
      >
        {t('byok.docsLink')}
      </Text>

      <Toast message={toast} onHide={() => setToast(null)} />
    </Shell>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    title: {
      marginTop: space.lg,
      marginBottom: space.md,
    },
    intro: {
      marginBottom: space.sm,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: space.lg,
      gap: space.md,
      marginTop: space.md,
    },
    stored: {
      marginBottom: space.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.md,
      backgroundColor: colors.surface2,
      color: colors.ink,
      paddingHorizontal: 12,
      minHeight: space.tapTarget,
      fontSize: 16,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    action: {
      flex: 1,
    },
    caption: {
      marginTop: space.lg,
    },
    docsLink: {
      // DESIGN.md reserves `accent` for the primary CTA and the active tab,
      // so a link is marked by the underline, not by color.
      marginTop: space.sm,
      textDecorationLine: 'underline',
    },
  });
}
