/**
 * Account screen (ACCOUNT.md §1/§2). Renders only when a CloudAdapter is
 * present — Profile's own "Compte" row (only rendered when
 * `useCloud().enabled`, app/profile.tsx) is the only live entry point, so
 * this screen bails to a blank BackLink-only canvas rather than crashing if
 * it's ever reached with no adapter (there is no route to it in that build).
 */
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { radius, space } from '@sotto/core/theme';
import { signInWithAppleWeb } from '../../src/cloud/appleWeb';
import { useCloud } from '../../src/cloud/provider';
import { useMe } from '../../src/cloud/useMe';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { fonts } from '../../src/ui/fonts';
import { formatDate } from '../../src/ui/formatDate';
import { Group } from '../../src/ui/GroupList';
import { Text } from '../../src/ui/Text';
import { Shell } from '../../src/ui/Shell';
import { Toast } from '../../src/ui/Toast';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';

const FREE_URL = 'https://readsotto.app';

type DeleteStep = 0 | 1 | 2;

export default function AccountScreen() {
  const t = useT();
  const router = useRouter();
  const cloud = useCloud();
  const me = useMe();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [toast, setToast] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>(0);
  const [confirmText, setConfirmText] = useState('');

  // CLOUD-API.md: native's magic-link redirect is `sotto://account?session=`
  // — this is the literal deep-link target, so forward straight to the
  // magic-link handler (app/account/magic.tsx) rather than duplicating its
  // completion logic here.
  const params = useLocalSearchParams<{ session?: string | string[]; paid?: string | string[] }>();
  useEffect(() => {
    const token = Array.isArray(params.session) ? params.session[0] : params.session;
    if (token) router.replace({ pathname: '/account/magic', params: { session: token } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.session]);

  // Checkout's successUrl lands back here with ?paid=1 (there is no
  // apps/client/app/billing/ route for it to go to) — refresh the
  // entitlement once, confirm with a toast, then drop the query param so a
  // reload doesn't re-fire it.
  useEffect(() => {
    const paid = Array.isArray(params.paid) ? params.paid[0] : params.paid;
    if (paid === '1') {
      me.refresh();
      setToast(t('account.paid.success'));
      router.replace('/account');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.paid]);

  const sendMagicLink = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      await cloud.requestMagicLink(email.trim(), Platform.OS === 'web' ? 'web' : 'native');
      setSent(true);
    } catch (err) {
      // Dev-only: the toast hides the real cause (e.g. a fetch TypeError),
      // which made the unbound-fetch bug invisible in production.
      if (process.env.NODE_ENV !== 'production') console.warn('requestMagicLink failed', err);
      setToast(t('account.magicLink.failed'));
    } finally {
      setBusy(false);
    }
  };

  const signInApple = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (Platform.OS === 'ios') {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          ],
        });
        if (!credential.identityToken) throw new Error('missing identityToken');
        await cloud.signInWithApple(credential.identityToken, 'native');
      } else {
        const idToken = await signInWithAppleWeb();
        await cloud.signInWithApple(idToken, 'web');
      }
      me.refresh();
    } catch (err) {
      const canceled =
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'ERR_REQUEST_CANCELED';
      if (!canceled) setToast(t('account.appleSignIn.failed'));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await cloud.signOut();
    } finally {
      me.refresh();
    }
  };

  const deleteAccountNow = async () => {
    try {
      await cloud.deleteAccount();
      setDeleteStep(0);
      setConfirmText('');
      me.refresh();
      setToast(t('account.delete.done'));
    } catch {
      setToast(t('account.delete.failed'));
    }
  };

  const openPortal = async () => {
    try {
      const { url } = await cloud.portal();
      await Linking.openURL(url);
    } catch {
      setToast(t('account.managePlan.failed'));
    }
  };

  // Same treatment as the paywall/usage screens: no CloudAdapter means no
  // live entry point to this screen at all (ACCOUNT.md §0/PAYWALL.md §4),
  // but show the short "not available" line rather than an empty canvas in
  // case it's ever reached directly.
  if (!cloud.enabled || me.status === 'no-cloud') {
    return (
      <Shell>
        <BackLink />
        <Text role="ui" size={15} color="ink2" style={styles.notAvailable}>
          {t('paywall.notAvailable')}
        </Text>
      </Shell>
    );
  }

  if (me.status === 'signed-in') {
    const { user, entitlement } = me.me;
    const confirmWord = t('account.delete.confirmWord');
    return (
      <Shell>
        <BackLink />
        <Text role="display" size={28} style={styles.title}>
          {t('account.title')}
        </Text>

        <View style={styles.groups}>
          <Group
            eyebrow={t('account.group.account')}
            rows={[
              { label: t('account.emailRow'), value: user.email },
              {
                label: t('account.planRow'),
                value:
                  entitlement.plan === 'free'
                    ? t('account.plan.free')
                    : t(`account.plan.${entitlement.plan}` as const),
                onPress: () => router.push('/usage'),
              },
              {
                label: t('account.renewalRow'),
                value: entitlement.renewsAt
                  ? formatDate(entitlement.renewsAt)
                  : t('account.renewalRow.none'),
              },
              { label: t('account.managePlan'), onPress: () => void openPortal() },
            ]}
          />

          {deleteStep === 0 ? (
            <Group
              rows={[
                { label: t('account.signOut'), onPress: () => void signOut() },
                {
                  label: t('account.deleteAccount'),
                  destructive: true,
                  onPress: () => setDeleteStep(1),
                },
              ]}
            />
          ) : (
            <Card style={styles.warnCard}>
              {deleteStep === 1 ? (
                <>
                  <Text role="ui" size={15}>
                    {t('account.delete.confirmTitle')}
                  </Text>
                  <Text role="caption" color="ink2" style={styles.warnBody}>
                    {t('account.delete.confirmBody')}
                  </Text>
                  <View style={styles.warnActions}>
                    <Button
                      variant="secondary"
                      title={t('common.cancel')}
                      onPress={() => setDeleteStep(0)}
                      style={styles.warnButton}
                    />
                    <Button
                      variant="ghost"
                      title={t('common.continue')}
                      onPress={() => setDeleteStep(2)}
                      style={styles.warnButton}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text role="ui" size={15}>
                    {t('account.delete.finalTitle')}
                  </Text>
                  <Text role="caption" color="ink2" style={styles.warnBody}>
                    {t('account.delete.finalBody', { word: confirmWord })}
                  </Text>
                  <TextInput
                    value={confirmText}
                    onChangeText={setConfirmText}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={styles.confirmInput}
                    placeholder={confirmWord}
                    placeholderTextColor={colors.ink3}
                  />
                  <View style={styles.warnActions}>
                    <Button
                      variant="secondary"
                      title={t('common.cancel')}
                      onPress={() => {
                        setDeleteStep(0);
                        setConfirmText('');
                      }}
                      style={styles.warnButton}
                    />
                    <Button
                      variant="ghost"
                      title={t('account.delete.finalButton')}
                      disabled={confirmText !== confirmWord}
                      onPress={() => void deleteAccountNow()}
                      style={styles.warnButton}
                    />
                  </View>
                </>
              )}
            </Card>
          )}
        </View>

        <Toast message={toast} onHide={() => setToast(null)} />
      </Shell>
    );
  }

  // signed-out
  return (
    <Shell>
      <BackLink />
      <Text role="display" size={28} style={styles.title}>
        {t('account.title')}
      </Text>
      <Text role="ui" size={16} color="ink2" style={styles.subhead}>
        {t('account.signedOut.subhead')}
      </Text>

      {Platform.OS === 'ios' ? (
        <>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.md}
            style={styles.appleButtonNative}
            onPress={() => void signInApple()}
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text role="caption" color="ink3" style={styles.dividerLabel}>
              {t('account.or')}
            </Text>
            <View style={styles.dividerLine} />
          </View>
        </>
      ) : null}

      <Card style={styles.emailCard}>
        <Text role="caption" color="ink2">
          {t('account.emailLabel')}
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          editable={!sent}
          placeholder="you@example.com"
          placeholderTextColor={colors.ink3}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.emailInput, sent && { color: colors.ink3 }]}
        />
        <Button
          title={sent ? t('account.emailSent') : t('account.emailSend')}
          variant="secondary"
          disabled={sent || !email.trim() || busy}
          onPress={() => void sendMagicLink()}
        />
      </Card>
      {sent ? (
        <Text role="caption" color="ink2" style={styles.sentCaption}>
          {t('account.emailSentCaption', { email })}
        </Text>
      ) : null}

      <Text
        role="caption"
        size={14}
        color="ink2"
        style={[styles.freeLink, webCursor]}
        onPress={() => void Linking.openURL(FREE_URL)}
        accessibilityRole="link"
      >
        {t('account.signedOut.freeLink')}
      </Text>

      <Toast message={toast} onHide={() => setToast(null)} />
    </Shell>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    notAvailable: {
      marginTop: space.xl,
    },
    title: {
      marginTop: space.lg,
    },
    subhead: {
      marginTop: space.sm,
      marginBottom: space.xl,
    },
    groups: {
      marginTop: space.lg,
      gap: space.gutter.phone,
    },
    warnCard: {
      borderColor: colors.warn,
      borderWidth: 1,
      gap: space.sm,
    },
    warnBody: {
      marginBottom: space.sm,
    },
    warnActions: {
      flexDirection: 'row',
      gap: space.sm,
    },
    warnButton: {
      flex: 1,
    },
    confirmInput: {
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: 14,
      fontFamily: fonts.interRegular,
      fontSize: 15,
      color: colors.ink,
      minHeight: space.tapTarget,
    },
    appleButtonNative: {
      width: '100%',
      height: space.tapTarget,
      marginTop: space.xs,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      marginVertical: space.lg,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.hairline,
    },
    dividerLabel: {
      textTransform: 'lowercase',
    },
    emailCard: {
      gap: space.sm,
    },
    emailInput: {
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: 14,
      fontFamily: fonts.interRegular,
      fontSize: 16,
      color: colors.ink,
      minHeight: space.tapTarget,
    },
    sentCaption: {
      marginTop: space.sm,
    },
    freeLink: {
      // DESIGN.md reserves `accent` for the primary CTA and the active tab,
      // so a link is marked by the underline, not by color.
      marginTop: space.xl,
      textDecorationLine: 'underline',
    },
  });
}
