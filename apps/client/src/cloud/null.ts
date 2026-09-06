/**
 * NullCloud — the default adapter (CONTRACTS §0: this repo never adds
 * auth/payments/analytics by default). `enabled` is false and every method
 * rejects with `CloudError('no_cloud')`, so any screen or gate that checks
 * `useCloud().enabled` before rendering never even calls these; anything
 * that forgets to check gets a clear, typed rejection instead of a silent
 * network call.
 */
import type { AuthConfig, CloudAdapter } from './types';
import { CloudError, MAGIC_LINK_ONLY } from './types';

function noCloud(): Promise<never> {
  return Promise.reject(new CloudError('no_cloud', 'No cloud service is configured.'));
}

export class NullCloud implements CloudAdapter {
  readonly enabled = false;

  me() {
    return noCloud();
  }
  signInWithApple() {
    return noCloud();
  }
  /** The one method that answers rather than rejecting: nothing here can sign
   * anyone in, and "no providers" is the true answer, not an error. */
  authConfig(): Promise<AuthConfig> {
    return Promise.resolve({ ...MAGIC_LINK_ONLY, magicLink: false });
  }
  requestMagicLink() {
    return noCloud();
  }
  completeNativeSession() {
    return noCloud();
  }
  signOut() {
    return noCloud();
  }
  deleteAccount() {
    return noCloud();
  }
  plans() {
    return noCloud();
  }
  checkout() {
    return noCloud();
  }
  portal() {
    return noCloud();
  }
  submitAppleTransaction() {
    return noCloud();
  }
  stubSubscribe() {
    return noCloud();
  }
  voiceSession() {
    return noCloud();
  }
  realtimeSecret() {
    return noCloud();
  }
  realtimeEnd() {
    return noCloud();
  }
  importBook() {
    return noCloud();
  }
}
