/**
 * In-memory registry of pending session options (created by POST
 * /voice/session, consumed once by GET /voice/ws when the client connects).
 * Entries expire after a short grace period so an abandoned session create
 * doesn't leak memory.
 */
import type { SessionOptions } from './types.js';

const PENDING_TTL_MS = 60_000;

interface PendingEntry {
  options: SessionOptions;
  expiresAt: number;
}

export class SessionRegistry {
  private readonly pending = new Map<string, PendingEntry>();

  create(sessionId: string, options: SessionOptions): void {
    this.pending.set(sessionId, { options, expiresAt: Date.now() + PENDING_TTL_MS });
    this.sweep();
  }

  /** Consumes (removes) the pending options for a session id, or null if unknown/expired. */
  take(sessionId: string): SessionOptions | null {
    const entry = this.pending.get(sessionId);
    this.pending.delete(sessionId);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.options;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.pending) {
      if (entry.expiresAt < now) this.pending.delete(id);
    }
  }
}
