/**
 * Account screen (ACCOUNT.md §1/§2, rebuilt by run 7 lane C).
 *
 * One route, three framings:
 *  - `/account?intent=start` — creating an account. This is where the landing
 *    page's "Start free" lands (CONFIRM 23): what you get, an email field, no
 *    card, no key.
 *  - `/account` signed out — coming back. Same field, different promise, with
 *    a switch to the create framing for anyone who arrived at the wrong door.
 *  - `/account` signed in — the account area: email, plan, where the reading
 *    data lives, sign out, delete.
 *
 * The signed-out half is a small state machine (idle → sending → sent →
 * resend, with a specific error at each edge) rather than the old
 * one-way `sent` boolean, because "I never got the email" was unrecoverable:
 * the field disabled itself and the button said "Sent" forever.
 *
 * Which providers are drawn comes from the server (`cloud.authConfig()`), not
 * from `Platform.OS`. Before this run the iOS build showed an Apple button
 * that called `POST /auth/apple`, a route which 404s in production
 * (CONFIRM 24). An unknown answer renders no provider button at all.
 *
 * Renders only when a CloudAdapter is present — the free origin has no
 * accounts, so it falls to the short "not available" line rather than a
 * sign-in form that could never work.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { radius, space } from '@sotto/core/theme';
import { signInWithAppleWeb } from '../../src/cloud/appleWeb';
import { resolveSignedInDestination } from '../../src/cloud/destination';
import { useCloud } from '../../src/cloud/provider';
import { safeReturnPath, signInReturnTo } from '../../src/cloud/returnTo';
import { CloudError, MAGIC_LINK_ONLY, type AuthConfig } from '../../src/cloud/types';
import { useMe } from '../../src/cloud/useMe';
import { useT, type MessageKey } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { usePreferences } from '../../src/ui/data';
import { fonts } from '../../src/ui/fonts';
import { formatDate } from '../../src/ui/formatDate';
import { Group } from '../../src/ui/GroupList';
import { Text } from '../../src/ui/Text';
import { Shell } from '../../src/ui/Shell';
import { Toast } from '../../src/ui/Toast';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';

const FREE_URL = 'https://readsotto.app';

/** Long enough that a second tap means "it really did not arrive", short
 * enough not to feel like a punishment. The server's own per-address limiter
 * is the real defence; this is only about the button lying. */
const RESEND_COOLDOWN_SECONDS = 30;

type DeleteStep = 0 | 1 | 2;

type SendState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'sent'; email: string; since: number }
  | { phase: 'error'; messageKey: MessageKey };

/** A very small check — the server is the authority, and a client-side email
 * regex that is stricter than reality rejects real addresses. This only
 * catches "they clearly have not finished typing". */
function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  const at = trimmed.indexOf('@');
  return at > 0 && trimmed.indexOf('.', at) > at + 1 && !/\s/.test(trimmed);
}

/** The server's error code, turned into a sentence about what to do next.
 * The old screen showed "Couldn't send the link. Try again." for every
 * failure, including the ones where trying again is exactly wrong. */
function messageKeyFor(err: unknown): MessageKey {
  if (err instanceof CloudError) {
    if (err.code === 'rate_limited') return 'account.error.rateLimited';
    if (err.code === 'invalid_request') return 'account.error.invalidEmail';
    if (err.code === 'no_cloud') return 'paywall.notAvailable';
    if (err.status === undefined) return 'account.error.offline';
  }
  // A bare TypeError from fetch is what a dead connection looks like here.
  if (err instanceof TypeError) return 'account.error.offline';
  return 'account.magicLink.failed';
}

export default function AccountScreen() {
  const t = useT();
  const router = useRouter();
  const cloud = useCloud();
  const me = useMe();
  const preferences = usePreferences();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [toast, setToast] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [send, setSend] = useState<SendState>({ phase: 'idle' });
  const [busy, setBusy] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>(0);
  const [confirmText, setConfirmText] = useState('');
  const [providers, setProviders] = useState<AuthConfig>(MAGIC_LINK_ONLY);
  const [cooldown, setCooldown] = useState(0);

  const params = useLocalSearchParams<{
    session?: string | string[];
    paid?: string | string[];
    intent?: string | string[];
    returnTo?: string | string[];
  }>();
  const intent = Array.isArray(params.intent) ? params.intent[0] : params.intent;
  const creating = intent === 'start';
  const returnTo = safeReturnPath(params.returnTo ?? null);

  // CLOUD-API.md: native's magic-link redirect is `sotto://account?session=`
  // — this is the literal deep-link target, so forward straight to the
  // magic-link handler (app/account/magic.tsx) rather than duplicating its
  // completion logic here. `returnTo` rides along so that screen can honour
  // it after the token exchange.
  useEffect(() => {
    const token = Array.isArray(params.session) ? params.session[0] : params.session;
    if (token) {
      router.replace({
        pathname: '/account/magic',
        params: returnTo ? { session: token, returnTo } : { session: token },
      });
    }
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

  // Ask the server which sign-in methods it actually has. `authConfig` never
  // rejects; an older or unreachable server answers magic-link-only, so a
  // failure here hides providers rather than guessing at them.
  useEffect(() => {
    if (!cloud.enabled) return undefined;
    let cancelled = false;
    void cloud.authConfig().then((config) => {
      if (!cancelled) setProviders(config);
    });
    return () => {
      cancelled = true;
    };
  }, [cloud]);

  // The resend countdown. One interval, torn down with the sent state.
  useEffect(() => {
    if (send.phase !== 'sent') {
      setCooldown(0);
      return undefined;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - send.since) / 1000);
      setCooldown(Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [send]);

  const sendMagicLink = useCallback(
    async (address: string, resent: boolean) => {
      const trimmed = address.trim();
      if (!looksLikeEmail(trimmed)) {
        setSend({ phase: 'error', messageKey: 'account.error.invalidEmail' });
        return;
      }
      setSend({ phase: 'sending' });
      try {
        await cloud.requestMagicLink(
          trimmed,
          Platform.OS === 'web' ? 'web' : 'native',
          signInReturnTo(returnTo),
        );
        setSend({ phase: 'sent', email: trimmed, since: Date.now() });
        if (resent) setToast(t('account.sent.resent'));
      } catch (err) {
        // Dev-only: the visible message is deliberately about what to do
        // next, which hides the real cause (e.g. a fetch TypeError) —
        // exactly what made the unbound-fetch bug invisible in production.
        if (process.env.NODE_ENV !== 'production') console.warn('requestMagicLink failed', err);
        setSend({ phase: 'error', messageKey: messageKeyFor(err) });
      }
    },
    [cloud, returnTo, t],
  );

  /**
   * Cancel: back where they came from. An explicit same-origin `returnTo`
   * wins; otherwise the navigation stack, if there is one; otherwise the app
   * itself, which for someone who never finished setup means onboarding.
   */
  const cancel = () => {
    if (returnTo) {
      router.replace(returnTo);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(preferences.onboarded ? '/(tabs)/home' : '/onboarding');
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
      router.replace(resolveSignedInDestination({ onboarded: preferences.onboarded, returnTo }));
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

  if (me.status === 'loading') {
    return (
      <Shell>
        <BackLink />
        <Text role="ui" size={15} color="ink2" style={styles.notAvailable}>
          {t('common.loading')}
        </Text>
      </Shell>
    );
  }

  if (me.status === 'signed-in') {
    const { user, entitlement } = me.me;
    const confirmWord = t('account.delete.confirmWord');
    const free = entitlement.plan === 'free';
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
                value: free
                  ? t('account.plan.free')
                  : t(`account.plan.${entitlement.plan}` as const),
                onPress: () => router.push('/usage'),
              },
              ...(free
                ? []
                : [
                    {
                      label: t('account.renewalRow'),
                      value: entitlement.renewsAt
                        ? formatDate(entitlement.renewsAt)
                        : t('account.renewalRow.none'),
                    },
                  ]),
              // A free account has nothing to manage; the honest action there
              // is "see what a plan adds", and it goes to the paywall rather
              // than to a Stripe portal that would open empty.
              free
                ? { label: t('account.seePlans'), onPress: () => router.push('/paywall') }
                : { label: t('account.managePlan'), onPress: () => void openPortal() },
            ]}
          />

          {/* Where the reading actually lives. There is no account sync and
              this run did not add one, so the account screen says so rather
              than letting an account imply a backup. */}
          <Group
            eyebrow={t('account.group.data')}
            rows={[{ label: t('account.dataRow'), value: t('account.dataRow.value') }]}
          />
          <Text role="caption" color="ink2" style={styles.dataNote}>
            {t('account.dataNote')}
          </Text>

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

  // Signed out: create, or come back.
  const sent = send.phase === 'sent' ? send : null;
  const sending = send.phase === 'sending';

  return (
    <Shell>
      <BackLink onPress={cancel} />
      <Text role="display" size={28} style={styles.title} testID="account-title">
        {t(creating ? 'account.create.title' : 'account.signIn.title')}
      </Text>
      <Text role="ui" size={16} color="ink2" style={styles.subhead}>
        {t(creating ? 'account.create.subhead' : 'account.signIn.subhead')}
      </Text>

      {creating ? (
        <View style={styles.benefits}>
          <BenefitLine text={t('account.create.benefit1')} colors={colors} />
          <BenefitLine text={t('account.create.benefit2')} colors={colors} />
          <BenefitLine text={t('account.create.benefit3')} colors={colors} />
        </View>
      ) : null}

      {/* Providers only where the server says the route exists. Today that is
          nothing, so nothing renders — no Apple button leading to a 404. */}
      {providers.apple ? (
        <>
          {Platform.OS === 'ios' ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radius.md}
              style={styles.appleButtonNative}
              onPress={() => void signInApple()}
            />
          ) : (
            <Button
              variant="secondary"
              title={t('account.appleSignIn.web')}
              onPress={() => void signInApple()}
              disabled={busy}
            />
          )}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text role="caption" color="ink3" style={styles.dividerLabel}>
              {t('account.or')}
            </Text>
            <View style={styles.dividerLine} />
          </View>
        </>
      ) : null}

      {sent ? (
        <Card style={styles.emailCard}>
          <Text role="ui" size={16} testID="account-sent">
            {t('account.sent.title')}
          </Text>
          <Text role="caption" color="ink2">
            {t('account.emailSentCaption', { email: sent.email })}
          </Text>
          <Button
            variant="secondary"
            title={
              cooldown > 0
                ? t('account.sent.resendIn', { seconds: String(cooldown) })
                : t('account.sent.resend')
            }
            disabled={cooldown > 0 || sending}
            onPress={() => void sendMagicLink(sent.email, true)}
          />
          <Text
            role="caption"
            size={14}
            color="ink2"
            style={[styles.inlineLink, webCursor]}
            accessibilityRole="button"
            onPress={() => setSend({ phase: 'idle' })}
          >
            {t('account.sent.changeEmail')}
          </Text>
        </Card>
      ) : (
        <Card style={styles.emailCard}>
          <Text role="caption" color="ink2">
            {t('account.emailLabel')}
          </Text>
          <TextInput
            value={email}
            onChangeText={(next) => {
              setEmail(next);
              if (send.phase === 'error') setSend({ phase: 'idle' });
            }}
            editable={!sending}
            placeholder="you@example.com"
            placeholderTextColor={colors.ink3}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="account-email"
            style={styles.emailInput}
          />
          <Button
            title={
              sending
                ? t('account.sending')
                : t(creating ? 'account.create.send' : 'account.emailSend')
            }
            variant={creating ? 'primary' : 'secondary'}
            disabled={sending || !email.trim()}
            onPress={() => void sendMagicLink(email, false)}
          />
          {send.phase === 'error' ? (
            <Text role="caption" color="warn" testID="account-error">
              {t(send.messageKey)}
            </Text>
          ) : null}
        </Card>
      )}

      <Text
        role="caption"
        size={14}
        color="ink2"
        style={[styles.inlineLink, styles.switchLink, webCursor]}
        accessibilityRole="button"
        testID="account-switch"
        onPress={() =>
          router.replace(
            creating
              ? { pathname: '/account', params: returnTo ? { returnTo } : {} }
              : {
                  pathname: '/account',
                  params: returnTo ? { intent: 'start', returnTo } : { intent: 'start' },
                },
          )
        }
      >
        {t(creating ? 'account.create.switch' : 'account.signIn.switch')}
      </Text>

      <Text role="caption" size={14} color="ink2" style={styles.cancelNote}>
        <Text
          role="caption"
          size={14}
          color="ink2"
          style={[styles.inlineLink, webCursor]}
          accessibilityRole="button"
          testID="account-cancel"
          onPress={cancel}
        >
          {t('common.cancel')}
        </Text>
      </Text>

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

/** A benefit line: an ink dash and a sentence. PAYWALL.md's own convention —
 * the design system has no bullet glyph, so plain text rather than a new one. */
function BenefitLine({
  text,
  colors,
}: {
  text: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <Text role="caption" size={14} color="ink2">
        —
      </Text>
      <Text role="caption" size={14} color="ink2" style={{ flex: 1, color: colors.ink2 }}>
        {text}
      </Text>
    </View>
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
      marginBottom: space.lg,
    },
    benefits: {
      gap: space.sm,
      marginBottom: space.xl,
    },
    groups: {
      marginTop: space.lg,
      gap: space.gutter.phone,
    },
    dataNote: {
      marginTop: -space.sm,
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
    // DESIGN.md reserves `accent` for the primary CTA and the active tab, so
    // a link is marked by the underline, not by colour.
    inlineLink: {
      textDecorationLine: 'underline',
    },
    switchLink: {
      marginTop: space.lg,
      alignSelf: 'center',
    },
    cancelNote: {
      marginTop: space.md,
      alignSelf: 'center',
    },
    freeLink: {
      marginTop: space.xl,
      textDecorationLine: 'underline',
    },
  });
}
