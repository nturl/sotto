/**
 * Origin allowlisting, per-IP session-creation throttling, and an optional
 * HTTP Basic auth check for the voice server. Kept dependency-free and
 * framework-free (no Fastify import) so it is unit-testable without
 * spinning up an HTTP server.
 *
 * This is deliberately not an auth system — the product has none. It exists
 * only to stop an arbitrary web page (or a stray device on an exposed host)
 * from silently driving a local voice session. See docs/voice-pipeline.md
 * "Security" for what this does and does not cover.
 */

import { timingSafeEqual } from 'node:crypto';

/** Parses SOTTO_CORS_ORIGINS (comma-separated) into a trimmed, non-empty list. */
export function parseAllowedOrigins(value: string | undefined, fallback: string): string[] {
  const raw = value && value.trim().length > 0 ? value : fallback;
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Loopback bind addresses. `::` and `0.0.0.0` are NOT loopback: they mean
 * "every interface", which is exactly the exposed case. */
const LOOPBACK_HOST_RE = /^(localhost|127(?:\.\d{1,3}){3}|::1|\[::1\])$/;

/**
 * Whether the server is bound only to the loopback interface, i.e. whether
 * "a browser on localhost" is necessarily this same machine's own user.
 */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOST_RE.test(host.trim());
}

/**
 * Whether `origin` (the browser's `Origin` header) may talk to this server.
 * An absent origin is always allowed: native clients (Expo Go, iOS/Android
 * builds) never send one, only browsers do, so this check only ever
 * constrains browser callers.
 *
 * `allowLoopback` blanket-allows any `http(s)://localhost:*` / `127.0.0.1:*`
 * origin. That is right for a localhost-bound dev server, where such a page
 * is the developer's own. It is wrong once the server is reachable off-box:
 * an exposed instance would then accept any page the victim happens to have
 * open on a localhost port — a dev server, another local app — regardless of
 * SOTTO_CORS_ORIGINS. app.ts ties it to whether SOTTO_HOST is loopback.
 * Defaults to true so existing callers and tests keep their old behaviour.
 */
export function isOriginAllowed(
  origin: string | undefined | null,
  allowedOrigins: readonly string[],
  allowLoopback = true,
): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return allowLoopback && LOCALHOST_ORIGIN_RE.test(origin);
}

/**
 * Checks a request's `Authorization` header against `SOTTO_BASIC_AUTH`
 * (a `user:pass` string, not base64-encoded — the header is). Used as a
 * privacy fence for a self-hosted single-user instance (docs/self-hosting.md),
 * not as multi-user auth. Constant-time comparison of equal-length buffers
 * to avoid a timing side channel on the credential; different-length inputs
 * short-circuit (safe, since length alone leaks far less than a byte-by-byte
 * timing signal would).
 */
export function isBasicAuthValid(
  authorizationHeader: string | undefined,
  credentials: string,
): boolean {
  if (!authorizationHeader?.startsWith('Basic ')) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(authorizationHeader.slice('Basic '.length), 'base64').toString('utf-8');
  } catch {
    return false;
  }
  const given = Buffer.from(decoded, 'utf-8');
  const expected = Buffer.from(credentials, 'utf-8');
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/**
 * Fixed-window counter: at most `maxPerWindow` calls to `allow(key)` succeed
 * per `windowMs` for a given key. Used to rate-limit session creation per IP.
 * In-memory only — resets on restart, does not share state across processes.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const cutoff = this.now() - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.maxPerWindow) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(this.now());
    this.hits.set(key, recent);
    return true;
  }
}
