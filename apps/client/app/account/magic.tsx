/**
 * Magic-link / Apple deep-link landing screen (CLOUD-API.md "Accounts (C1)":
 * native's `/auth/magic-link/verify` redirects to
 * `sotto://account?session=<token>`; web's redirects the browser straight
 * to `APP_BASE_URL<returnTo>` with the session cookie already set, no token
 * in the URL). `app/account/index.tsx` forwards any `session` param it
 * receives here so both entry shapes converge on one completion path.
 *
 * Native: exchanges the one-time token for a session via
 * `completeNativeSession` (stores it in SecureStore, HttpCloudAdapter).
 * Web: there is no client-visible token to exchange — the cookie already
 * did the work — so this just refreshes `useMe()` and moves on.
 *
 * Run 7 lane C: this is also where the sign-in link lands by default, and
 * where "where do they go now" is decided. It has to be decided here rather
 * than on the server, because "onboarded" is a local preference and the
 * server has never seen it. A learner who has not finished setup goes to
 * onboarding; everyone else goes home, or to the screen they were on when
 * they asked to sign in.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { resolveSignedInDestination } from '../../src/cloud/destination';
import { useCloud } from '../../src/cloud/provider';
import { useMe } from '../../src/cloud/useMe';
import { useT } from '../../src/i18n/useT';
import { usePreferences } from '../../src/ui/data';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';

export default function AccountMagicScreen() {
  const t = useT();
  const router = useRouter();
  const cloud = useCloud();
  const me = useMe();
  const preferences = usePreferences();
  const params = useLocalSearchParams<{
    session?: string | string[];
    returnTo?: string | string[];
  }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = Array.isArray(params.session) ? params.session[0] : params.session;

    async function run() {
      if (Platform.OS !== 'web' && token) {
        try {
          await cloud.completeNativeSession(token);
        } catch {
          if (!cancelled) setFailed(true);
          return;
        }
      }
      me.refresh();
      if (!cancelled) {
        router.replace(
          resolveSignedInDestination({
            onboarded: preferences.onboarded,
            returnTo: params.returnTo ?? null,
          }),
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // Only re-run when the link's own parameters change — `cloud`/`me`/
    // `router` are stable across this screen's short lifetime, and
    // `preferences.onboarded` is read once at the moment of the decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.session, params.returnTo]);

  return (
    <Shell>
      <Text role="ui" size={16} color="ink2" style={{ marginTop: space.xl }}>
        {failed ? t('account.magicLink.failed') : t('account.magicLink.completing')}
      </Text>
    </Shell>
  );
}
