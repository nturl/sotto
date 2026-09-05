/**
 * NullCloud — the default adapter (CONTRACTS §0: this repo never adds
 * auth/payments/analytics by default). `enabled` is false and every method
 * rejects with `CloudError('no_cloud')`, so any screen or gate that checks
 * `useCloud().enabled` before rendering never even calls these; anything
 * that forgets to check gets a clear, typed rejection instead of a silent
 * network call.
 */
import type { CloudAdapter } from './types';
import { CloudError } from './types';

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
