/**
 * Native no-op: there's no service worker on iOS/Android, so warming its
 * content cache is meaningless there (F1.2). Same shape as the web
 * implementation so callers in `state/createStore.ts` don't need to branch.
 */
export async function warmBookCache(_urls: string[]): Promise<void> {
  // no-op
}
