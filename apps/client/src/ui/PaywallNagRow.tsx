/**
 * PAYWALL.md §1a — the Home quiet row. Renders at most once per session
 * (src/paywall/nagOnce.ts), never during reading/narration/voice (it only
 * ever mounts on Home), and not at all when there's no CloudAdapter
 * (PAYWALL.md §4 / §6). `Card` surface, hairline border, a caption line on
 * the left and an accent text action on the right — no icon, no dismiss X,
 * no button chrome.
 */
import { useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { useCloud } from '../cloud/provider';
import { useT } from '../i18n/useT';
import { claimNagSlot } from '../paywall/nagOnce';
import { Card } from './Card';
import { Text } from './Text';
import { webCursor } from './tokens';

export function PaywallNagRow({ spacingBelow }: { spacingBelow?: number }) {
  const cloud = useCloud();
  const t = useT();
  const router = useRouter();
  const [visible] = useState(() => cloud.enabled && claimNagSlot());

  if (!visible) return null;

  return (
    <Card padding={space.md} style={{ ...styles.card, marginBottom: spacingBelow }}>
      <Text role="caption" color="ink2" style={styles.copy}>
        {t('paywall.nag.copy')}
      </Text>
      <Pressable
        onPress={() => router.push('/paywall')}
        accessibilityRole="button"
        accessibilityLabel={t('paywall.nag.cta')}
        style={webCursor}
      >
        <Text role="uiButton" size={15} color="accent">
          {t('paywall.nag.cta')}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = {
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
  },
  copy: {
    flex: 1,
  },
};
