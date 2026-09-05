# sotto-cloud client API contract (v1, fixed 2026-09-05 by the run 3 orchestrator)

Lanes C1-C4 implement these in `sotto-cloud`; Lane S codes the client `HttpCloudAdapter` against them. Additive changes only; anything else stops and escalates. Base URL: `EXPO_PUBLIC_CLOUD_URL` (unset => NullCloud, no account/paywall/usage UI renders). Auth: web = httpOnly session cookie; native = `Authorization: Bearer <session token>`. All errors: `{ error: <code>, message: <learner-facing string, English> }`.

## Accounts (C1)
- `POST /auth/apple` `{ identityToken, kind: 'native'|'web', fullName? }` -> `{ user, session?: { token, expiresAt } }` (token only for native).
- `POST /auth/magic-link` `{ email, kind }` -> `200 {}` always.
- `GET /auth/magic-link/verify?token=` -> web: sets cookie, 302 to `APP_BASE_URL/account`; native: 302 to `sotto://account?session=<token>`.
- `POST /auth/sign-out` -> 204. `DELETE /account` -> 204 (requires re-auth within 10 min or a confirmation token from `POST /account/delete/request`).
- `GET /me` -> `{ user: { id, email }, entitlement: { plan: 'free'|'standard'|'plus', tutorMinutesCap, tutorMinutesUsed, tutorMinutesRemaining, importBooksCap, importsUsed, renewsAt: string|null, provider: 'none'|'cascade-openai'|'cascade-open'|'realtime-mini'|'realtime' } }`; 401 when signed out.

## Billing (C2)
- `GET /billing/plans` -> `{ plans: [{ id, name, priceUsd, tutorMinutesCap, importBooksCap, provider, appleProductId, stripePriceId }], billing: 'stripe'|'stub' }` (public).
- `POST /billing/checkout` `{ plan, successUrl, cancelUrl }` -> `{ url }` (Stripe Checkout, or the stub checkout page in staging).
- `GET /billing/portal` -> `{ url }` (Stripe customer portal; stub page in staging).
- `POST /billing/apple/transaction` `{ jws }` (expo-iap purchase result) -> `{ entitlement }` after server-side verification; 400 on invalid.
- `POST /billing/stub/subscribe` `{ plan }` -> `{ entitlement }` — staging only, 404 in production.
- Webhooks (server-to-server, not for the client): `POST /webhooks/stripe`, `POST /webhooks/apple`.

## Voice broker (C3)
- `POST /voice/session` body = CONTRACTS §5b SessionOptions -> `{ sessionId, wsUrl, sampleRate: 16000, limits: { maxMs, idleMs }, provider, remainingSeconds }`; `wsUrl` is on the cloud host and carries a one-time `?session=` secret (60 s to connect). 402 `{ error: 'cap_exhausted', message }` when minutes are gone; 402 `{ error: 'plan_required' }` on free; 503 `{ error: 'tutor_disabled' }` (kill switch or daily ceiling). WS protocol identical to CONTRACTS §5b plus `{ t: 'limit', reason: 'cap' }` before close and `{ t: 'usage', secondsUsed, remainingSeconds }` every 30 s.
- `POST /voice/realtime/secret` `{ bookId, chapterId, mode, learner, passage, savedWords }` -> `{ value: 'ek_...', expiresAt, model, maxSeconds, callId }`; client connects WebRTC to OpenAI itself and must `POST /voice/realtime/end { callId }` on hangup (server also closes the meter at maxSeconds).

## Hosted import (C4)
Mirrors the OSS local routes Lane I builds: `POST /import` multipart -> `{ jobId, estimate: { minutes, costUsd } }` (402 when imports are gone); `GET /import/:jobId/events` SSE; `GET /import/:jobId/result`; `GET /import/:jobId/audio/:file`; `POST /import/:jobId/narrate/:chapterIndex`; `GET /imports` (list mine); `DELETE /imports/:id`.

## Client adapter (S)
```ts
interface CloudAdapter {
  readonly enabled: boolean;
  me(): Promise<Me | null>;                       // null = signed out
  signInWithApple(identityToken: string, kind: 'native'|'web'): Promise<Me>;
  requestMagicLink(email: string, kind: 'native'|'web'): Promise<void>;
  completeNativeSession(token: string): Promise<Me>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  plans(): Promise<PlansResponse>;
  checkout(plan: string): Promise<{ url: string }>;
  portal(): Promise<{ url: string }>;
  submitAppleTransaction(jws: string): Promise<Entitlement>;
  stubSubscribe(plan: string): Promise<Entitlement>;   // staging only
  voiceSession(opts: SessionOptions): Promise<CloudVoiceSession>;  // throws CloudError('cap_exhausted'|...)
  realtimeSecret(opts: SessionOptions): Promise<RealtimeSecret>;
  importBook(file, opts, onProgress): Promise<ImportHandle>;
}
```
`NullCloud.enabled === false` and every method rejects with `CloudError('no_cloud')`.
