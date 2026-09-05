/**
 * HttpCloudAdapter — talks to a real `sotto-cloud` deployment (CLOUD-API.md).
 * Selected when `EXPO_PUBLIC_CLOUD_URL` is set and `EXPO_PUBLIC_CLOUD` is not
 * `fake` (provider.ts).
 *
 * Auth transport differs by platform (CLOUD-API.md preamble): web relies on
 * an httpOnly session cookie (`credentials: 'include'`), so the client never
 * sees the token; native has no cookie jar shared with a browser, so the
 * session token from `/auth/apple` / the magic-link deep link is kept in
 * `expo-secure-store` (Keychain/Keystore-backed, not AsyncStorage/plain
 * storage — this is a bearer credential) and sent as `Authorization: Bearer`.
 *
 * `platform` and the native `tokenStore` are constructor-injected rather
 * than read from `react-native`'s `Platform`/imported from
 * `expo-secure-store` at module scope: both of those packages' entry points
 * use Flow syntax Metro understands but plain Node/vitest can't parse, so a
 * static top-level import of either breaks every unit test that imports
 * this file (including this one's own — see http.test.ts). The default
 * token store loads `expo-secure-store` via a *dynamic* import instead,
 * which is never evaluated unless something on native actually calls it;
 * `provider.tsx` (the one production call site) passes `Platform.OS`
 * explicitly so app code needs nothing special.
 */
import type { SessionOptions } from '@sotto/voice';
import type {
  CloudAdapter,
  Entitlement,
  ImportHandle,
  ImportOptions,
  ImportProgressEvent,
  Me,
  PlansResponse,
  RealtimeSecret,
  CloudVoiceSession,
} from './types';
import { CloudError } from './types';

const SESSION_KEY = 'sotto.cloud.session';

export interface CloudTokenStore {
  get(): Promise<string | null>;
  set(token: string | null): Promise<void>;
}

function defaultNativeTokenStore(): CloudTokenStore {
  return {
    async get() {
      try {
        const SecureStore = await import('expo-secure-store');
        return await SecureStore.getItemAsync(SESSION_KEY);
      } catch {
        return null;
      }
    },
    async set(token) {
      try {
        const SecureStore = await import('expo-secure-store');
        if (token) await SecureStore.setItemAsync(SESSION_KEY, token);
        else await SecureStore.deleteItemAsync(SESSION_KEY);
      } catch {
        // Keychain/Keystore unavailable (e.g. simulator without one
        // configured) — the session simply won't survive a relaunch; not
        // fatal to the call that triggered this.
      }
    },
  };
}

interface ServerErrorBody {
  error?: string;
  message?: string;
}

export interface HttpCloudAdapterOptions {
  fetch?: typeof fetch;
  /** Defaults to 'web' (the safer default: never touches SecureStore). */
  platform?: 'web' | 'native';
  /** Defaults to a `expo-secure-store`-backed store, loaded lazily. Inject
   * an in-memory fake in tests instead of exercising the real module. */
  tokenStore?: CloudTokenStore;
}

export class HttpCloudAdapter implements CloudAdapter {
  readonly enabled = true;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly platform: 'web' | 'native';
  private readonly tokenStore: CloudTokenStore;

  constructor(baseUrl: string, opts: HttpCloudAdapterOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    // Bind the default: browsers enforce the Fetch spec's receiver check, so a
    // detached `fetch` reference throws "Illegal invocation" when called as
    // `this.fetchImpl(...)`. Same pattern as packages/voice local-cascade.ts.
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    this.platform = opts.platform ?? 'web';
    this.tokenStore = opts.tokenStore ?? defaultNativeTokenStore();
  }

  /** Shared request helper. Throws `CloudError` (with `.status`) on any
   * non-2xx response, using the server's `{ error, message }` body per
   * CLOUD-API.md's preamble. */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (this.platform !== 'web') {
      const token = await this.tokenStore.get();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      ...(this.platform === 'web' ? { credentials: 'include' as RequestCredentials } : {}),
    });

    if (res.status === 204) return undefined as T;

    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!res.ok) {
      const err = (body as ServerErrorBody | null) ?? {};
      throw new CloudError(
        err.error ?? `http_${res.status}`,
        err.message ?? `Request failed (${res.status}).`,
        res.status,
      );
    }
    return body as T;
  }

  async me(): Promise<Me | null> {
    try {
      return await this.request<Me>('/me');
    } catch (err) {
      if (err instanceof CloudError && err.status === 401) return null;
      throw err;
    }
  }

  async signInWithApple(identityToken: string, kind: 'native' | 'web'): Promise<Me> {
    const res = await this.request<{ user: Me['user']; session?: { token: string } }>(
      '/auth/apple',
      { method: 'POST', body: JSON.stringify({ identityToken, kind }) },
    );
    if (res.session?.token) await this.tokenStore.set(res.session.token);
    const me = await this.me();
    if (!me) throw new CloudError('session_invalid', 'Sign-in did not complete.');
    return me;
  }

  async requestMagicLink(email: string, kind: 'native' | 'web'): Promise<void> {
    await this.request('/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email, kind }),
    });
  }

  async completeNativeSession(token: string): Promise<Me> {
    await this.tokenStore.set(token);
    const me = await this.me();
    if (!me) {
      await this.tokenStore.set(null);
      throw new CloudError('session_invalid', 'That link has expired.');
    }
    return me;
  }

  async signOut(): Promise<void> {
    await this.request('/auth/sign-out', { method: 'POST' });
    await this.tokenStore.set(null);
  }

  async deleteAccount(): Promise<void> {
    await this.request('/account', { method: 'DELETE' });
    await this.tokenStore.set(null);
  }

  async plans(): Promise<PlansResponse> {
    return this.request<PlansResponse>('/billing/plans');
  }

  async checkout(plan: string): Promise<{ url: string }> {
    return this.request('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({
        plan,
        successUrl: `${this.baseUrl}/billing/success`,
        cancelUrl: `${this.baseUrl}/billing/cancel`,
      }),
    });
  }

  async portal(): Promise<{ url: string }> {
    return this.request('/billing/portal');
  }

  async submitAppleTransaction(jws: string): Promise<Entitlement> {
    const res = await this.request<{ entitlement: Entitlement }>('/billing/apple/transaction', {
      method: 'POST',
      body: JSON.stringify({ jws }),
    });
    return res.entitlement;
  }

  async stubSubscribe(plan: string): Promise<Entitlement> {
    const res = await this.request<{ entitlement: Entitlement }>('/billing/stub/subscribe', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    });
    return res.entitlement;
  }

  async voiceSession(opts: SessionOptions): Promise<CloudVoiceSession> {
    return this.request<CloudVoiceSession>('/voice/session', {
      method: 'POST',
      body: JSON.stringify(opts),
    });
  }

  async realtimeSecret(opts: SessionOptions): Promise<RealtimeSecret> {
    return this.request<RealtimeSecret>('/voice/realtime/secret', {
      method: 'POST',
      body: JSON.stringify({
        bookId: opts.bookId,
        chapterId: opts.chapterId,
        mode: opts.mode,
        learner: opts.learner,
        passage: opts.passage,
        savedWords: opts.savedWords,
      }),
    });
  }

  async importBook(
    file: Blob,
    opts: ImportOptions,
    onProgress?: (e: ImportProgressEvent) => void,
  ): Promise<ImportHandle> {
    const form = new FormData();
    form.append('file', file);
    if (opts.bookTitle) form.append('bookTitle', opts.bookTitle);
    if (opts.sourceLocale) form.append('sourceLocale', opts.sourceLocale);

    const headers: Record<string, string> = {};
    if (this.platform !== 'web') {
      const token = await this.tokenStore.get();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const res = await this.fetchImpl(`${this.baseUrl}/import`, {
      method: 'POST',
      body: form,
      headers,
      ...(this.platform === 'web' ? { credentials: 'include' as RequestCredentials } : {}),
    });
    const text = await res.text();
    const body = text ? (JSON.parse(text) as ServerErrorBody & Partial<ImportHandle>) : {};
    if (!res.ok) {
      throw new CloudError(
        body.error ?? `http_${res.status}`,
        body.message ?? `Import failed (${res.status}).`,
        res.status,
      );
    }
    // SSE progress (`GET /import/:jobId/events`) is polled by the import
    // screen itself (Lane I's concern); this adapter reports the one-shot
    // "accepted" transition so a caller with no progress UI still gets a
    // signal.
    onProgress?.({ type: 'progress', message: 'queued' });
    return body as ImportHandle;
  }
}
