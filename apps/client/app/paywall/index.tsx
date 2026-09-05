/**
 * Paywall screen (PAYWALL.md §2). Card-pair plan comparison; the cutout CTA
 * is the one pressable commitment on the screen. Renders only when a
 * CloudAdapter is present (PAYWALL.md §4/§6) — Home's nag row and any
 * paid-feature tap are the only live entry points, both gated on
 * `useCloud().enabled`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { purchaseWithAppleIap, restoreApplePurchases } from '../../src/cloud/iap';
import { useCloud } from '../../src/cloud/provider';
import type { BillingInterval, PlanOffer } from '../../src/cloud/types';
import { CloudError } from '../../src/cloud/types';
import { useMe } from '../../src/cloud/useMe';
import { getUiCatalog, useT, type MessageKey, type MessageValues } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { SectionEyebrow } from '../../src/ui/SectionEyebrow';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';

// R4-D2: the paid client is served from the cloud origin itself, so Terms/
// Privacy point at that origin's own server-rendered pages (sotto-cloud R4-D1,
// GET /terms and /privacy) rather than docs/*.md, which exist nowhere as a
// hosted page. Same env var provider.tsx uses to pick HttpCloudAdapter.
const CLOUD_ORIGIN = (process.env.EXPO_PUBLIC_CLOUD_URL ?? 'https://app.readsotto.app').replace(
  /\/$/,
  '',
);
const TERMS_URL = `${CLOUD_ORIGIN}/terms`;
const PRIVACY_URL = `${CLOUD_ORIGIN}/privacy`;

const isTestBuild =
  process.env.EXPO_PUBLIC_CLOUD === 'fake' || process.env.EXPO_PUBLIC_CLOUD_STAGING === '1';

/** Formats a plan's price for the current interface locale and billing
 * interval (adversarial review 3 coordinator note: this used to hardcode the
 * French "/mois" suffix regardless of the interface language). The amount
 * itself is locale-formatted via Intl.NumberFormat; the "/mo" / "/yr" suffix
 * comes from the `paywall.perMonth` / `paywall.perYear` catalog keys. */
function priceLabel(
  plan: PlanOffer,
  interval: BillingInterval,
  t: (key: MessageKey, values?: MessageValues) => string,
): string {
  const value = interval === 'year' ? plan.yearlyPriceUsd : plan.priceUsd;
  const amount = new Intl.NumberFormat(getUiCatalog(), {
    style: 'currency',
    currency: 'USD',
  }).format(value);
  return `${amount}${t(interval === 'year' ? 'paywall.perYear' : 'paywall.perMonth')}`;
}

export default function PaywallScreen() {
  const t = useT();
  const router = useRouter();
  const cloud = useCloud();
  const me = useMe();
  const { isDesktop } = useLayoutMetrics();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(), []);

  const [plans, setPlans] = useState<PlanOffer[] | null>(null);
  const [interval, setInterval] = useState<BillingInterval>('month');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cloud.enabled) return;
    let cancelled = false;
    void cloud
      .plans()
      .then((res) => {
        if (cancelled) return;
        // PAYWALL.md's card-pair layout predates D1's plan trim (free +
        // standard only, no more Plus): one plan card, not a card per row.
        // Free never renders as a purchasable card here.
        setPlans(res.plans.filter((p) => p.priceUsd > 0));
      })
      .catch(() => {
        // A thrown error here (network failure, or the http.ts unbound-
        // fetch bug this was chasing) used to leave the screen stuck on
        // "Loading…" forever with no feedback — surface it instead.
        if (!cancelled) setError(t('paywall.purchaseFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [cloud]);

  if (!cloud.enabled) {
    return (
      <Shell>
        <BackLink />
        <Text role="ui" size={15} color="ink2" style={styles.notAvailable}>
          {t('paywall.notAvailable')}
        </Text>
      </Shell>
    );
  }

  // PAYWALL.md's card-pair spec predates the trim to one paid plan
  // (sotto-cloud R4-D1: free + standard); one card, month/year toggle.
  const selected = plans?.[0] ?? null;

  const afterEntitlement = () => {
    me.refresh();
    router.back();
  };

  const subscribe = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (Platform.OS === 'ios') {
        await purchaseWithAppleIap(cloud, selected.appleProductId);
        afterEntitlement();
      } else {
        const { url } = await cloud.checkout(selected.id, interval);
        await Linking.openURL(url);
      }
    } catch (err) {
      setError(err instanceof CloudError ? err.message : t('paywall.purchaseFailed'));
    } finally {
      setBusy(false);
    }
  };

  const subscribeTest = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await cloud.stubSubscribe(selected.id);
      afterEntitlement();
    } catch (err) {
      setError(err instanceof CloudError ? err.message : t('paywall.purchaseFailed'));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (Platform.OS === 'ios') {
        await restoreApplePurchases(cloud);
      }
      afterEntitlement();
    } catch {
      setError(t('paywall.restoreFailed'));
    } finally {
      setBusy(false);
    }
  };

  const openWeb = () => {
    if (!selected) return;
    void Linking.openURL(`https://sotto.dev/subscribe?plan=${encodeURIComponent(selected.id)}`);
  };

  return (
    <Shell>
      <BackLink />
      <View style={[styles.measure, !isDesktop && styles.measurePhone]}>
        <Text role="display" size={30} style={styles.title}>
          {t('paywall.title')}
        </Text>
        <Text role="ui" size={16} color="ink2" style={styles.subhead}>
          {t('paywall.subhead')}
        </Text>

        {!plans ? (
          <Text role="ui" size={15} color="ink2" style={styles.loadingPlans}>
            {t('common.loading')}
          </Text>
        ) : (
          <>
            <View style={[styles.cards, isDesktop && styles.cardsDesktop]}>
              {selected ? (
                <Card padding={space.lg} style={styles.planCard}>
                  <SectionEyebrow>{selected.name.toUpperCase()}</SectionEyebrow>
                  <Text role="heading" size={22} style={styles.planPrice}>
                    {priceLabel(selected, interval, t)}
                  </Text>

                  <View
                    style={styles.intervalToggle}
                    accessibilityRole="radiogroup"
                    accessibilityLabel={t('paywall.interval.label')}
                  >
                    {(['month', 'year'] as const).map((iv) => {
                      const isSelected = interval === iv;
                      return (
                        <Pressable
                          key={iv}
                          onPress={() => setInterval(iv)}
                          disabled={busy}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isSelected, disabled: busy }}
                          style={[
                            styles.intervalOption,
                            {
                              borderColor: isSelected ? colors.ink : colors.hairline,
                              borderWidth: isSelected ? 1.5 : 1,
                            },
                          ]}
                        >
                          <Text role="ui" size={14} color={isSelected ? 'ink' : 'ink2'}>
                            {t(iv === 'month' ? 'paywall.interval.month' : 'paywall.interval.year')}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.planBullets}>
                    <Text role="caption" color="ink2">
                      — {t('paywall.plan.minutes', { count: selected.tutorMinutesCap })}
                    </Text>
                    <Text role="caption" color="ink2">
                      — {t('paywall.plan.imports', { count: selected.importBooksCap })}
                    </Text>
                    <Text role="caption" color="ink2">
                      — {t('paywall.plan.voice.standard')}
                    </Text>
                  </View>
                </Card>
              ) : null}
            </View>

            <Button
              title={
                busy
                  ? '···'
                  : t('paywall.subscribe', {
                      price: selected ? priceLabel(selected, interval, t) : '',
                    })
              }
              disabled={busy || !selected}
              onPress={() => void subscribe()}
              style={styles.cta}
            />

            {Platform.OS === 'ios' && selected ? (
              <Text role="caption" color="ink3" style={styles.webPriceCaption}>
                {t('paywall.webPrice.prefix', { price: priceLabel(selected, interval, t) })}
                <Text role="caption" color="accent" onPress={openWeb}>
                  {t('paywall.webPrice.link')}
                </Text>
              </Text>
            ) : null}

            {isTestBuild ? (
              <Text
                role="ui"
                size={14}
                color="ink2"
                onPress={() => void subscribeTest()}
                style={styles.testAction}
              >
                {t('paywall.subscribeTest')}
              </Text>
            ) : null}

            {error ? (
              <Text role="caption" color="warn" style={styles.error}>
                {error}
              </Text>
            ) : null}

            <Text role="caption" color="ink2" onPress={() => void restore()} style={styles.restore}>
              {t('paywall.restore')}
            </Text>
          </>
        )}

        <Text role="caption" color="ink3" style={styles.legal}>
          {t('paywall.legal.prefix')}
          <Text
            role="caption"
            color="ink3"
            style={styles.legalLink}
            onPress={() => void Linking.openURL(TERMS_URL)}
          >
            {t('paywall.legal.terms')}
          </Text>
          {t('paywall.legal.and')}
          <Text
            role="caption"
            color="ink3"
            style={styles.legalLink}
            onPress={() => void Linking.openURL(PRIVACY_URL)}
          >
            {t('paywall.legal.privacy')}
          </Text>
          {t('paywall.legal.suffix')}
        </Text>
      </View>
    </Shell>
  );
}

function createStyles() {
  return StyleSheet.create({
    notAvailable: {
      marginTop: space.xl,
    },
    measure: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      marginTop: space.lg,
    },
    measurePhone: {
      maxWidth: undefined,
    },
    title: {
      marginBottom: space.sm,
    },
    subhead: {
      marginBottom: space.xl,
    },
    loadingPlans: {
      marginTop: space.xl,
    },
    cards: {
      gap: space.md,
      marginBottom: space.xl,
    },
    cardsDesktop: {
      flexDirection: 'row',
    },
    cardWrapDesktop: {
      flex: 1,
    },
    planCard: {
      width: '100%',
    },
    planPrice: {
      marginTop: space.xs,
      marginBottom: space.md,
    },
    intervalToggle: {
      flexDirection: 'row',
      gap: space.sm,
      marginBottom: space.md,
    },
    intervalOption: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: space.sm,
      borderRadius: 10,
    },
    planBullets: {
      gap: 4,
      marginBottom: space.md,
    },
    cta: {
      marginBottom: space.sm,
    },
    webPriceCaption: {
      textAlign: 'center',
      marginBottom: space.md,
    },
    testAction: {
      textAlign: 'center',
      marginBottom: space.md,
    },
    error: {
      textAlign: 'center',
      marginBottom: space.md,
    },
    restore: {
      textAlign: 'center',
      marginBottom: space.xl,
    },
    legal: {
      textAlign: 'center',
      marginBottom: space.xl,
    },
    legalLink: {
      textDecorationLine: 'underline',
    },
  });
}
