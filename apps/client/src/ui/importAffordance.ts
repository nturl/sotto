/**
 * Whether Library shows its "Import a book" affordance.
 *
 * run10/B2: Library used to answer "no" out loud. When the local server was
 * unreachable it printed "Needs the local server or the paid tier" directly
 * under the title, which on readsotto.app is always, and which a stranger
 * reads as "the library needs the paid tier". The rule is now silent: the
 * affordance appears when importing can actually work, and nothing takes its
 * place when it can't. Settings > Data > Import a book stays the documented
 * path for anyone running the server themselves.
 *
 * `serverReachable` is `undefined` while the health check is in flight, and
 * a pending check is not a yes: an affordance that pops in a beat late is
 * better than one that flickers away.
 *
 * The paid build imports through the cloud (app/import/index.tsx's hosted
 * path), so it keeps the affordance with no local server at all.
 */
export function showImportAffordance(
  serverReachable: boolean | undefined,
  cloudEnabled: boolean,
): boolean {
  return serverReachable === true || cloudEnabled;
}
