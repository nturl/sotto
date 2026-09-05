/**
 * Web: tells the active service worker to warm its content cache for a
 * book that was just opened (F1.2) — book.json, every chapter file,
 * cover.svg, and every chapter's audio — so a stranger's *first* opened
 * book is offline-ready without needing a second load. No-op in dev
 * (`_layout.tsx` never registers the SW outside a production build, so
 * `navigator.serviceWorker.ready` would just hang) and wherever there's no
 * service worker at all (older browsers, `http://` local testing).
 */
export async function warmBookCache(urls: string[]): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (!nav?.serviceWorker) return;
  try {
    const registration = await nav.serviceWorker.ready;
    registration.active?.postMessage({ type: 'cache-book', urls });
  } catch {
    // Best-effort: caching for offline is a nice-to-have, never block the
    // reading flow it's warming a cache for.
  }
}
