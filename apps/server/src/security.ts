/**
 * Origin allowlisting and per-IP session-creation throttling for the voice
 * server. Kept dependency-free and framework-free (no Fastify import) so it
 * is unit-testable without spinning up an HTTP server.
 *
 * This is deliberately not an auth system — the product has none. It exists
 * only to stop an arbitrary web page (or a stray device on an exposed host)
 * from silently driving a local voice session. See docs/voice-pipeline.md
 * "Security" for what this does and does not cover.
 */

/** Parses SOTTO_CORS_ORIGINS (comma-separated) into a trimmed, non-empty list. */
export function parseAllowedOrigins(value: string | undefined, fallback: string): string[] {
  const raw = value && value.trim().length > 0 ? value : fallback;
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Whether `origin` (the browser's `Origin` header) may talk to this server.
 * An absent origin is always allowed: native clients (Expo Go, iOS/Android
 * builds) never send one, only browsers do, so this check only ever
 * constrains browser callers.
 */
export function isOriginAllowed(
  origin: string | undefined | null,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return LOCALHOST_ORIGIN_RE.test(origin);
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
