/**
 * CloudAdapter contract (planning/CLOUD-API.md "Client adapter (S)"). Every
 * screen in `app/account/**`, `app/paywall/**`, `app/usage/**` and the
 * `cloud` voice path (`src/voice/availability.ts`, `sessionManager.ts`)
 * codes only against this interface — never against `NullCloud`,
 * `FakeCloudAdapter` or `HttpCloudAdapter` directly, so a build with no
 * `CloudAdapter` configured (the OSS default, CONTRACTS §0 "never add
 * auth/payments/analytics as a default") never imports fetch/SecureStore
 * logic at all.
 */
import type { SessionOptions } from '@sotto/voice';

export type Plan = 'free' | 'standard' | 'plus';

export type CloudProviderId =
  'none' | 'cascade-openai' | 'cascade-open' | 'realtime-mini' | 'realtime';

export interface CloudUser {
  id: string;
  email: string;
}

export interface Entitlement {
  plan: Plan;
  tutorMinutesCap: number;
  tutorMinutesUsed: number;
  tutorMinutesRemaining: number;
  importBooksCap: number;
  importsUsed: number;
  renewsAt: string | null;
  provider: CloudProviderId;
}

export interface Me {
  user: CloudUser;
  entitlement: Entitlement;
}

export interface PlanOffer {
  id: string;
  name: string;
  priceUsd: number;
  tutorMinutesCap: number;
  importBooksCap: number;
  provider: CloudProviderId;
  appleProductId: string;
  stripePriceId: string;
}

export interface PlansResponse {
  plans: PlanOffer[];
  billing: 'stripe' | 'stub';
}

export interface CloudVoiceSession {
  sessionId: string;
  wsUrl: string;
  sampleRate: number;
  limits: { maxMs: number; idleMs: number };
  provider: CloudProviderId;
  remainingSeconds: number;
}

export interface RealtimeSecret {
  value: string;
  expiresAt: string;
  model: string;
  maxSeconds: number;
  callId: string;
}

export interface ImportEstimate {
  minutes: number;
  costUsd: number;
}

export interface ImportProgressEvent {
  type: 'progress' | 'done' | 'error';
  message?: string;
}

export interface ImportHandle {
  jobId: string;
  estimate: ImportEstimate;
}

export interface ImportOptions {
  bookTitle?: string;
  sourceLocale?: string;
}

/** Server error shape (CLOUD-API.md preamble): `{ error, message }`, always
 * an English learner-facing string. `status` is the client's own addition
 * (the HTTP status the body came with) so `HttpCloudAdapter.me()` can tell
 * "signed out" (401) apart from every other failure without inventing a
 * server error code the contract never specifies. */
export class CloudError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message?: string, status?: number) {
    super(message ?? code);
    this.name = 'CloudError';
    this.code = code;
    this.status = status;
  }
}

export interface CloudAdapter {
  readonly enabled: boolean;
  me(): Promise<Me | null>;
  signInWithApple(identityToken: string, kind: 'native' | 'web'): Promise<Me>;
  requestMagicLink(email: string, kind: 'native' | 'web'): Promise<void>;
  completeNativeSession(token: string): Promise<Me>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  plans(): Promise<PlansResponse>;
  checkout(plan: string): Promise<{ url: string }>;
  portal(): Promise<{ url: string }>;
  submitAppleTransaction(jws: string): Promise<Entitlement>;
  /** Staging only; NullCloud/production HTTP throws `no_cloud`/404. */
  stubSubscribe(plan: string): Promise<Entitlement>;
  voiceSession(opts: SessionOptions): Promise<CloudVoiceSession>;
  realtimeSecret(opts: SessionOptions): Promise<RealtimeSecret>;
  /** POST /voice/realtime/end (CLOUD-API.md): reported client-side audio
   * seconds for a Realtime call — a cross-check only, never trusted for
   * the cap or the spend ceiling (those are booked server-side off wall
   * clock; see sotto-cloud DECISIONS.md #22 and adversarial review 3
   * finding 4). Finding 3's missing half: without this, a Realtime call
   * is only ever closed by the server's reaper, at the full ceiling. */
  realtimeEnd(
    callId: string,
    report: { audioSecondsIn: number; audioSecondsOut: number },
  ): Promise<void>;
  importBook(
    file: Blob,
    opts: ImportOptions,
    onProgress?: (e: ImportProgressEvent) => void,
  ): Promise<ImportHandle>;
}
