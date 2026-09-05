/**
 * Usage screen (ACCOUNT.md §3). Stat-block stack: two segmented-bar
 * "minutes"/"imports" cards, then a per-session list. Reached from the
 * signed-in Account screen's "Forfait" row (and Profile's own shortcut).
 * Renders only when a CloudAdapter is present and the learner is signed in.
 */
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { useCloud } from '../../src/cloud/provider';
import { useMe } from '../../src/cloud/useMe';
import type { Entitlement } from '../../src/cloud/types';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { formatDate } from '../../src/ui/formatDate';
import { Shell, useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';

const SEGMENTS = 10;

function SegmentedBar({ used, cap }: { used: number; cap: number }) {
  const { colors } = useTheme();
  const fraction = cap > 0 ? Math.min(1, used / cap) : 0;
  const filled = Math.round(fraction * SEGMENTS);
  return (
    <View style={styles.barTrack}>
      {Array.from({ length: SEGMENTS }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.barSegment,
            { backgroundColor: i < filled ? colors.ink : colors.surface2 },
          ]}
        />
      ))}
    </View>
  );
}

function StatBlock({
  label,
  used,
  cap,
  unit,
  overCapMessage,
  resetLabel,
}: {
  label: string;
  used: number;
  cap: number;
  unit: string;
  overCapMessage?: string;
  resetLabel: string;
}) {
  const overCap = cap > 0 && used >= cap;
  return (
    <Card style={styles.statCard}>
      <Text role="caption" color="ink2">
        {label}
      </Text>
      <Text role="ui" size={16} color={overCap ? 'warn' : 'ink'} style={styles.statValue}>
        <Text role="mono" size={16} color={overCap ? 'warn' : 'ink'}>
          {used}
        </Text>
        {` / ${cap}${unit ? ` ${unit}` : ''}`}
      </Text>
      <SegmentedBar used={used} cap={cap} />
      <Text role="caption" color="ink3" style={styles.resetLine}>
        {resetLabel}
      </Text>
      {overCap && overCapMessage ? (
        <Text role="caption" color="warn" style={styles.overCapLine}>
          {overCapMessage}
        </Text>
      ) : null}
    </Card>
  );
}

export default function UsageScreen() {
  const t = useT();
  const router = useRouter();
  const cloud = useCloud();
  const me = useMe();
  const { isDesktop } = useLayoutMetrics();

  // No CloudAdapter at all: this screen has no live entry point in that
  // build (ACCOUNT.md/PAYWALL.md §4/§6), but show the same short
  // "not available" line the paywall shows rather than an empty canvas, in
  // case it's ever reached directly (a stale link, a deep link, etc.).
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

  // Still resolving `cloud.me()` — a brief BackLink-only canvas here is
  // fine (it resolves in one round trip and every screen this app has
  // already does the same during its own initial data fetch); the bug this
  // fixes is the *signed-out* case never leaving this shape at all.
  if (me.status === 'loading') {
    return (
      <Shell>
        <BackLink />
      </Shell>
    );
  }

  // Signed out: Usage has no stats to show yet — a dedicated state per
  // ACCOUNT.md's pattern (title + one caption + a primary CTA to Account),
  // not the blank canvas this used to fall through to.
  if (me.status === 'signed-out') {
    return (
      <Shell>
        <BackLink />
        <View style={[styles.measure, isDesktop && styles.measureDesktop]}>
          <Text role="display" size={28} style={styles.title}>
            {t('usage.title')}
          </Text>
          <Text role="ui" size={16} color="ink2" style={styles.signedOutCaption}>
            {t('usage.signedOut.caption')}
          </Text>
          <Button title={t('account.signIn')} onPress={() => router.push('/account')} />
        </View>
      </Shell>
    );
  }

  const entitlement: Entitlement = me.me.entitlement;
  const resetLabel = entitlement.renewsAt
    ? t('usage.resetsOn', { date: formatDate(entitlement.renewsAt) })
    : '';
  const overCapMessage = t('usage.overCap', {
    date: entitlement.renewsAt ? formatDate(entitlement.renewsAt) : '',
  });

  return (
    <Shell>
      <BackLink />
      <View style={[styles.measure, isDesktop && styles.measureDesktop]}>
        <Text role="display" size={28} style={styles.title}>
          {t('usage.title')}
        </Text>

        <View style={styles.stats}>
          <StatBlock
            label={t('usage.minutes.label')}
            used={entitlement.tutorMinutesUsed}
            cap={entitlement.tutorMinutesCap}
            unit={t('usage.minutes.unit')}
            overCapMessage={overCapMessage}
            resetLabel={resetLabel}
          />
          <StatBlock
            label={t('usage.imports.label')}
            used={entitlement.importsUsed}
            cap={entitlement.importBooksCap}
            unit={t('usage.imports.unit')}
            resetLabel={resetLabel}
          />
        </View>

        <Text role="heading" size={20} style={styles.sessionsHeading}>
          {t('usage.sessions.title')}
        </Text>
        <Card padding={0} style={styles.sessionsCard}>
          <Text role="caption" color="ink3" style={styles.sessionsEmpty}>
            {t('usage.sessions.empty')}
          </Text>
        </Card>

        <Text
          role="ui"
          size={15}
          color="accent"
          onPress={() => router.push('/paywall')}
          style={styles.upgradeLink}
        >
          {t('paywall.title')}
        </Text>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  notAvailable: {
    marginTop: space.xl,
  },
  signedOutCaption: {
    marginBottom: space.xl,
  },
  measure: {
    marginTop: space.lg,
  },
  measureDesktop: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  title: {
    marginBottom: space.lg,
  },
  stats: {
    gap: space.md,
  },
  statCard: {
    gap: space.sm,
  },
  statValue: {
    marginTop: 2,
  },
  barTrack: {
    flexDirection: 'row',
    gap: 2,
    height: 8,
    marginTop: 4,
  },
  barSegment: {
    flex: 1,
    borderRadius: 2,
  },
  resetLine: {
    marginTop: 2,
  },
  overCapLine: {
    marginTop: 4,
  },
  sessionsHeading: {
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  sessionsCard: {
    overflow: 'hidden',
  },
  sessionsEmpty: {
    padding: space.lg,
  },
  upgradeLink: {
    marginTop: space.xl,
    textAlign: 'center',
  },
});
