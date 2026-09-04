/**
 * The app's single store instance — screens import `useSottoStore` from
 * here. Wires the real platform Persistence adapter; see createStore.ts for
 * the factory (tests use that directly with an in-memory fake).
 */
import { persistence } from '../platform/persistence';
import { createSottoStore } from './createStore';

const { useStore, hydrate } = createSottoStore(persistence);

export const useSottoStore = useStore;

/** Resolves once preferences/progress/vocabulary/session have been read
 * from disk. Call once at app startup (root layout) before first render of
 * data-dependent screens. */
export const storeReady: Promise<void> = hydrate();

export type { SottoState, SottoStore } from './createStore';
