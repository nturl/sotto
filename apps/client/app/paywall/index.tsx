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
import type { PlanOffer } from '../../src/cloud/types';
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

const TERMS_URL = 'https://github.com/nturl/sotto/blob/main/docs/terms.md';
const PRIVACY_URL = 'https://github.com/nturl/sotto/blob/main/docs/privacy.md';

const isTestBuild =
  process.env.EXPO_PUBLIC_CLOUD === 'fake' || process.env.EXPO_PUBLIC_CLOUD_STAGING === '1';

/** Formats a plan's monthly USD price for the current interface locale
 * (adversarial review 3 coordinator note: this used to hardcode the
 * French "/mois" suffix regardless of the interface language). The
 * amount itself is locale-formatted via Intl.NumberFormat; the "/mo"
 * suffix comes from the `paywall.perMonth` catalog key. */
function priceLabel(plan: PlanOffer, t: (key: MessageKey, values?: MessageValues) => string): string {
  const amount = new Intl.NumberFormat(getUiCatalog(), {
    style: 'currency',
    currency: 'USD',
  }).format(plan.priceUsd);
  return `${amount}${t('paywall.perMonth')}`;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cloud.enabled) return;
    let cancelled = false;
    void cloud.plans().then((res) => {
      if (cancelled) return;
      setPlans(res.plans);
      setSelectedId((prev) => prev ?? res.plans[0]?.id ?? null);
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

  const selected = plans?.find((p) => p.id === selectedId) ?? plans?.[0] ?? null;

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
        const { url } = await cloud.checkout(selected.id);
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
              {plans.map((plan) => {
                const isSelected = plan.id === selectedId;
                return (
                  <Pressable
                    key={plan.id}
                    onPress={() => setSelectedId(plan.id)}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected, disabled: busy }}
                    accessibilityLabel={`${plan.name} — ${priceLabel(plan, t)}`}
                    style={isDesktop ? styles.cardWrapDesktop : undefined}
                  >
                    <Card
                      padding={space.lg}
                      style={{
                        borderWidth: isSelected ? 1.5 : 1,
                        borderColor: isSelected ? colors.ink : colors.hairline,
                      }}
                    >
                      <SectionEyebrow>{plan.name.toUpperCase()}</SectionEyebrow>
                      <Text role="heading" size={22} style={styles.planPrice}>
                        {priceLabel(plan, t)}
                      </Text>
                      <View style={styles.planBullets}>
                        <Text role="caption" color="ink2">
                          — {t('paywall.plan.minutes', { count: plan.tutorMinutesCap })}
                        </Text>
                        <Text role="caption" color="ink2">
                          — {t('paywall.plan.imports', { count: plan.importBooksCap })}
                        </Text>
                        <Text role="caption" color="ink2">
                          — {t(`paywall.plan.voice.${plan.id}` as MessageKey)}
                        </Text>
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </View>

            <Button
              title={
                busy
                  ? '···'
                  : t('paywall.subscribe', { price: selected ? priceLabel(selected, t) : '' })
              }
              disabled={busy || !selected}
              onPress={() => void subscribe()}
              style={styles.cta}
            />

            {Platform.OS === 'ios' && selected ? (
              <Text role="caption" color="ink3" style={styles.webPriceCaption}>
                {t('paywall.webPrice.prefix', { price: priceLabel(selected, t) })}
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
    planPrice: {
      marginTop: space.xs,
      marginBottom: space.md,
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
