/**
 * Session-local bookId -> jobId map (planning/LEDGER.md "R3-I Importer"):
 * apps/server's import jobs live in memory with a 30-minute TTL (see
 * apps/server/src/import/jobs.ts), keyed by jobId, not bookId — lazy
 * per-chapter narration (`POST /import/:jobId/narrate/:chapterIndex`)
 * needs that jobId. The progress screen (app/import/[jobId].tsx) registers
 * the mapping once a job finishes; useLazyNarration.ts reads it. This is
 * deliberately session-local, not persisted: a book imported in an earlier
 * session (or after the job's 30-minute TTL) can no longer be narrated
 * lazily through the original job — see the importer report for why a
 * durable path (re-running narrateChapter from the stored book/chapters
 * with no job at all) is future work, not built in this lane.
 */
const registry = new Map<string, string>();

export function registerImportJob(bookId: string, jobId: string): void {
  registry.set(bookId, jobId);
}

export function getImportJobId(bookId: string): string | undefined {
  return registry.get(bookId);
}
