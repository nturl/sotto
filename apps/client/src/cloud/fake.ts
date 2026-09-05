/**
 * FakeCloudAdapter — in-memory user/entitlement, selected when
 * `EXPO_PUBLIC_CLOUD=fake` (provider.ts). Used for unit tests, the
 * Playwright screenshot/e2e run (docs/evidence/cloud-ui-fake-*.log) and any
 * local dev session that wants the account/paywall/usage screens without a
 * real `sotto-cloud` deployment. Plan numbers match PAYWALL.md's literal
 * placeholder copy ($9.99/$19.99, 200/600 minutes, 5/20 imports).
 */
import type { SessionOptions } from '@sotto/voice';
import type {
  BillingInterval,
  CloudAdapter,
  Entitlement,
  ImportHandle,
  ImportOptions,
  ImportProgressEvent,
  Me,
  Plan,
  PlanOffer,
  PlansResponse,
  RealtimeSecret,
  CloudVoiceSession,
} from './types';
import { CloudError } from './types';

// Matches sotto-cloud R4-D1's trimmed shipped table (free + standard only;
// plus/realtime parked in code, not shipped — DECISIONS.md #30).
const PLANS: PlanOffer[] = [
  {
    id: 'standard',
    name: 'Standard',
    priceUsd: 9.99,
    yearlyPriceUsd: 79,
    tutorMinutesCap: 250,
    importBooksCap: 2,
    narratedMinutesCap: 120,
    provider: 'cascade-openai',
    appleProductId: 'sotto.standard.monthly',
    stripePriceId: 'price_fake_standard_month',
    stripeYearlyPriceId: 'price_fake_standard_year',
  },
];

function freeEntitlement(): Entitlement {
  return {
    plan: 'free',
    tutorMinutesCap: 0,
    tutorMinutesUsed: 0,
    tutorMinutesRemaining: 0,
    importBooksCap: 0,
    importsUsed: 0,
    renewsAt: null,
    provider: 'none',
  };
}

function entitlementFor(plan: PlanOffer): Entitlement {
  return {
    plan: plan.id as Plan,
    tutorMinutesCap: plan.tutorMinutesCap,
    tutorMinutesUsed: 0,
    tutorMinutesRemaining: plan.tutorMinutesCap,
    importBooksCap: plan.importBooksCap,
    importsUsed: 0,
    narratedMinutesCap: plan.narratedMinutesCap,
    renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    provider: plan.provider,
  };
}

let fakeUserSeq = 0;

export class FakeCloudAdapter implements CloudAdapter {
  readonly enabled = true;

  private user: { id: string; email: string } | null = null;
  private entitlement: Entitlement = freeEntitlement();
  private sentMagicLinks = new Set<string>();

  async me(): Promise<Me | null> {
    if (!this.user) return null;
    return { user: this.user, entitlement: this.entitlement };
  }

  private signIn(email: string): Me {
    fakeUserSeq += 1;
    this.user = { id: `fake-user-${fakeUserSeq}`, email };
    return { user: this.user, entitlement: this.entitlement };
  }

  async signInWithApple(_identityToken: string, _kind: 'native' | 'web'): Promise<Me> {
    return this.signIn('learner@example.com');
  }

  async requestMagicLink(email: string, _kind: 'native' | 'web'): Promise<void> {
    this.sentMagicLinks.add(email);
  }

  /** Fake native deep-link completion: any token the fake magic-link flow
   * itself issued ("fake-session-<email>") signs that email in. */
  async completeNativeSession(token: string): Promise<Me> {
    const match = /^fake-session-(.+)$/.exec(token);
    if (!match) throw new CloudError('session_invalid', 'That link has expired.');
    return this.signIn(decodeURIComponent(match[1]!));
  }

  async signOut(): Promise<void> {
    this.user = null;
  }

  async deleteAccount(): Promise<void> {
    if (!this.user) throw new CloudError('unauthenticated', 'Sign in first.');
    this.user = null;
    this.entitlement = freeEntitlement();
  }

  async plans(): Promise<PlansResponse> {
    return { plans: PLANS, billing: 'stub' };
  }

  async checkout(plan: string, interval?: BillingInterval): Promise<{ url: string }> {
    return {
      url: `https://checkout.fake.sotto.dev/session?plan=${encodeURIComponent(plan)}&interval=${interval ?? 'month'}`,
    };
  }

  async portal(): Promise<{ url: string }> {
    return { url: 'https://billing.fake.sotto.dev/portal' };
  }

  async submitAppleTransaction(_jws: string): Promise<Entitlement> {
    const plan = PLANS[0]!;
    this.entitlement = entitlementFor(plan);
    return this.entitlement;
  }

  async stubSubscribe(planId: string): Promise<Entitlement> {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) throw new CloudError('unknown_plan', `No such plan: ${planId}`);
    // Real billing requires a signed-in session first (`/billing/stub/
    // subscribe` is authenticated on the server too — CLOUD-API.md). The
    // paywall's "Subscribe (test)" action is explicitly a staging/e2e
    // shortcut around the real StoreKit/Stripe flow, not around sign-in
    // itself — but fake mode has no real inbox or Apple identity to click
    // through, so auto-completing a demo sign-in here (rather than
    // silently subscribing an anonymous session, which no real server
    // would do) keeps the shortcut honest: reachable from the Account
    // screen's signed-out state, exactly like a real subscribe would be.
    if (!this.user) this.signIn('learner@example.com');
    this.entitlement = entitlementFor(plan);
    return this.entitlement;
  }

  async voiceSession(_opts: SessionOptions): Promise<CloudVoiceSession> {
    if (this.entitlement.plan === 'free') {
      throw new CloudError('plan_required', 'A plan is required for the hosted tutor.');
    }
    if (this.entitlement.tutorMinutesRemaining <= 0) {
      throw new CloudError('cap_exhausted', "You've used all your tutor minutes this month.");
    }
    return {
      sessionId: `fake-session-${Date.now()}`,
      wsUrl: 'wss://fake.cloud.sotto.dev/voice/ws?session=fake',
      sampleRate: 16000,
      limits: { maxMs: 1_200_000, idleMs: 90_000 },
      provider: this.entitlement.provider,
      remainingSeconds: Math.round(this.entitlement.tutorMinutesRemaining * 60),
    };
  }

  async realtimeSecret(_opts: SessionOptions): Promise<RealtimeSecret> {
    if (this.entitlement.plan === 'free') {
      throw new CloudError('plan_required', 'A plan is required for the hosted tutor.');
    }
    return {
      value: 'ek_fake_secret',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      model: 'gpt-realtime-fake',
      maxSeconds: 1200,
      callId: `fake-call-${Date.now()}`,
    };
  }

  async realtimeEnd(
    _callId: string,
    _report: { audioSecondsIn: number; audioSecondsOut: number },
  ): Promise<void> {
    // no-op — nothing server-side to close in fake mode.
  }

  async importBook(
    _file: Blob,
    _opts: ImportOptions,
    onProgress?: (e: ImportProgressEvent) => void,
  ): Promise<ImportHandle> {
    if (this.entitlement.importBooksCap - this.entitlement.importsUsed <= 0) {
      throw new CloudError('cap_exhausted', "You've used all your imports this month.");
    }
    onProgress?.({ type: 'progress', message: 'queued' });
    onProgress?.({ type: 'done' });
    this.entitlement = { ...this.entitlement, importsUsed: this.entitlement.importsUsed + 1 };
    return { jobId: `fake-job-${Date.now()}`, estimate: { minutes: 2, costUsd: 0 } };
  }
}
