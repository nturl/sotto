/**
 * Magic-link / Apple deep-link landing screen (CLOUD-API.md "Accounts (C1)":
 * native's `/auth/magic-link/verify` redirects to
 * `sotto://account?session=<token>`; web's redirects the browser straight
 * to `APP_BASE_URL/account` with the session cookie already set, no token
 * in the URL). `app/account/index.tsx` forwards any `session` param it
 * receives here so both entry shapes converge on one completion path.
 *
 * Native: exchanges the one-time token for a session via
 * `completeNativeSession` (stores it in SecureStore, HttpCloudAdapter).
 * Web: there is no client-visible token to exchange — the cookie already
 * did the work — so this just refreshes `useMe()` and moves on.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { useCloud } from '../../src/cloud/provider';
import { useMe } from '../../src/cloud/useMe';
import { useT } from '../../src/i18n/useT';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';

export default function AccountMagicScreen() {
  const t = useT();
  const router = useRouter();
  const cloud = useCloud();
  const me = useMe();
  const params = useLocalSearchParams<{ session?: string | string[] }>();
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
      if (!cancelled) router.replace('/account');
    }

    void run();
    return () => {
      cancelled = true;
    };
    // Only re-run when the token itself changes — `cloud`/`me`/`router` are
    // stable across this screen's short lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.session]);

  return (
    <Shell>
      <Text role="ui" size={16} color="ink2" style={{ marginTop: space.xl }}>
        {failed ? t('account.magicLink.failed') : t('account.magicLink.completing')}
      </Text>
    </Shell>
  );
}
