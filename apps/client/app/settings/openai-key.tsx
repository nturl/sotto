/**
 * Settings > Your OpenAI key (lane R4-B2, docs/byok.md).
 *
 * The one screen where the learner's own API key is entered. Everything it
 * does is deliberately narrow:
 *  - the input is `secureTextEntry`, so the key is never rendered in clear
 *    text, and a key already stored is shown only as a mask (`maskKey`) —
 *    the screen never reads the stored value back into the field;
 *  - Save validates against `GET /v1/models` before storing. That endpoint
 *    is the only one whose 401 a browser page can read (R4-B1 phase 2,
 *    docs/evidence/byok-cors-2026-09-05.log): the inference endpoints'
 *    invalid-key 401 arrives with no `Access-Control-Allow-Origin` and
 *    surfaces as an opaque "Failed to fetch", so validating there would be
 *    indistinguishable from being offline;
 *  - storage is byokKey.ts (localStorage on web, expo-secure-store on
 *    native) and never the Zustand persisted store, which Profile > Export
 *    writes to a file.
 *
 * Structure follows the other settings screens: Shell + BackLink + a
 * surface/hairline card, theme tokens from @sotto/core.
 */
import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, TextInput, View } from 'react-native';
import { validateOpenAIKey } from '@sotto/voice';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { Toast } from '../../src/ui/Toast';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';
import { getByokKey, maskKey, removeByokKey, setByokKey } from '../../src/voice/byokKey';

const DOCS_URL = 'https://github.com/nturl/sotto/blob/main/docs/byok.md';

export default function OpenAIKeyScreen() {
  const t = useT();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [draft, setDraft] = useState('');
  const [stored, setStored] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    // Only the mask is kept in component state; the raw value is read once
    // to produce it and then dropped.
    void getByokKey().then((key) => setStored(key ? maskKey(key) : null));
  }, []);

  const save = async () => {
    const key = draft.trim();
    if (!key || busy) return;
    setBusy(true);
    setError(null);
    const verdict = await validateOpenAIKey(key);
    if (!verdict.ok) {
      setBusy(false);
      setError(verdict.reason === 'network' ? t('byok.networkError') : t('byok.invalid'));
      return;
    }
    await setByokKey(key);
    setStored(maskKey(key));
    setDraft('');
    setBusy(false);
    setToast(t('byok.saved'));
  };

  const remove = async () => {
    await removeByokKey();
    setStored(null);
    setDraft('');
    setError(null);
    setToast(t('byok.removed'));
  };

  return (
    <Shell>
      <BackLink />
      <Text role="display" style={styles.title}>
        {t('byok.title')}
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
            title={busy ? t('byok.checking') : t('byok.save')}
            onPress={() => void save()}
            disabled={busy || !draft.trim()}
            accessibilityLabel={t('byok.save')}
            style={styles.action}
          />
          {stored ? (
            <Button
              variant="secondary"
              title={t('byok.remove')}
              onPress={() => void remove()}
              accessibilityLabel={t('byok.remove')}
              style={styles.action}
            />
          ) : null}
        </View>
      </View>

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
      marginBottom: space.xl,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: space.lg,
      gap: space.md,
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
