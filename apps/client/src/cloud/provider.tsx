/**
 * CloudProvider / useCloud — picks the one CloudAdapter this app run uses,
 * once, at startup:
 *   EXPO_PUBLIC_CLOUD=fake       -> FakeCloudAdapter (tests, screenshots)
 *   EXPO_PUBLIC_CLOUD_URL=<url>  -> HttpCloudAdapter(url)
 *   neither                     -> NullCloud (the OSS default, CONTRACTS §0)
 * Selection happens at module load, not inside the component, so every
 * consumer in a given process — including code that runs before React mounts
 * (e.g. a future deep-link handler) — sees the same instance.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { CloudAdapter } from './types';
import { NullCloud } from './null';
import { FakeCloudAdapter } from './fake';
import { HttpCloudAdapter } from './http';

/** web vs native, without a static `import { Platform } from 'react-native'`
 * — that module's entry point uses Flow syntax Metro understands but plain
 * Node/vitest can't parse, and this file is on sessionManager.ts's import
 * graph (via `getCloudAdapter`, below), which several unit tests import.
 * React Native Web always runs in a real DOM (`document` exists); true
 * native JS engines (Hermes/JSC) never have one. */
function detectPlatform(): 'web' | 'native' {
  return typeof document === 'undefined' ? 'native' : 'web';
}

function createAdapter(): CloudAdapter {
  if (process.env.EXPO_PUBLIC_CLOUD === 'fake') return new FakeCloudAdapter();
  const url = process.env.EXPO_PUBLIC_CLOUD_URL;
  if (url) return new HttpCloudAdapter(url, { platform: detectPlatform() });
  return new NullCloud();
}

const cloudAdapter: CloudAdapter = createAdapter();

const CloudContext = createContext<CloudAdapter>(cloudAdapter);

export function CloudProvider({ children }: { children: ReactNode }) {
  return <CloudContext.Provider value={cloudAdapter}>{children}</CloudContext.Provider>;
}

export function useCloud(): CloudAdapter {
  return useContext(CloudContext);
}

/** Non-React access to the same singleton, for the voice session manager
 * (src/voice/sessionManager.ts) — a module-level object outside React that
 * can't call `useCloud()` but needs the adapter to build the cloud voice
 * path's `LocalCascadeProvider.createSession` override. */
export function getCloudAdapter(): CloudAdapter {
  return cloudAdapter;
}
