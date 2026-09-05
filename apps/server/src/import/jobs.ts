/**
 * In-memory import job store (planning/LEDGER.md "R3-I Importer"): one
 * `POST /import` starts a job, `GET /import/:jobId/events` streams its
 * progress over SSE, `GET /import/:jobId/result` returns the finished
 * pack. Mirrors voice/registry.ts's in-memory-map-with-TTL shape — this
 * server has no database and none is warranted for a single-machine,
 * localhost-only dev tool.
 *
 * Finding 9 (adversarial review 3): a hung import used to brick the
 * server's importer permanently (sweep() never evicted a `running` job,
 * so runningJobId never cleared) and finished jobs held their full
 * ImportResult — audio buffers included — for the whole 30-minute TTL
 * with no periodic eviction. Both are fixed here: importBook now runs
 * under an AbortSignal with a wall-clock ceiling, sweep() actively fails
 * a job that outlives it, and a periodic timer frees audio buffers
 * shortly after a job finishes rather than waiting on the next lazy call.
 */
import { randomUUID } from 'node:crypto';
import {
  importBook,
  type ImportOptions,
  type ImportProgress,
  type ImportResult,
} from '@sotto/content/import';

const JOB_TTL_MS = 30 * 60_000;

/** Wall-clock ceiling for one import job. Overridable for tests via the
 * constructor; the default matches a generous real-world local-model run
 * (a large book's gloss/translate/narrate passes can legitimately take
 * many minutes) while still bounding a hung or adversarially slow run. */
export const DEFAULT_IMPORT_JOB_MAX_MS = 45 * 60_000;

/** How long a finished job's audio buffers are kept before being freed —
 * the job record (and its text result) survive until JOB_TTL_MS so
 * `/result` still answers, but the large binary payloads don't need to. */
export const AUDIO_RETENTION_MS = 5 * 60_000;

/** How often the background sweep timer runs. */
const SWEEP_INTERVAL_MS = 30_000;

export type JobStatus = 'running' | 'done' | 'error';

export interface ImportJob {
  id: string;
  status: JobStatus;
  createdAt: number;
  expiresAt: number;
  /** Wall-clock deadline for a running job; sweep() fails the job past this. */
  deadline: number;
  events: ImportProgress[];
  result?: ImportResult;
  error?: string;
  listeners: Set<(event: ImportProgress) => void>;
  abort: AbortController;
  /** Set when the job leaves 'running' (done or error); drives the audio
   * eviction timer independently of expiresAt/JOB_TTL_MS. */
  completedAt?: number;
  /** Set once a finished job's audio buffers have been freed. */
  audioFreedAt?: number;
}

/** At most one import runs at a time (LEDGER "jobs live in memory, one at
 * a time") — a single background LLM/TTS/STT pipeline is already enough
 * concurrent load against the local model stack. */
export class ImportJobRegistry {
  private readonly jobs = new Map<string, ImportJob>();
  private runningJobId: string | null = null;
  private readonly jobMaxMs: number;
  private sweepTimer: NodeJS.Timeout | undefined;

  constructor(opts: { jobMaxMs?: number; autoSweep?: boolean } = {}) {
    this.jobMaxMs = opts.jobMaxMs ?? DEFAULT_IMPORT_JOB_MAX_MS;
    if (opts.autoSweep !== false) {
      // unref() so this timer never keeps the process alive on its own.
      this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
      this.sweepTimer.unref?.();
    }
  }

  /** Stops the background sweep timer (tests only). */
  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  isBusy(): boolean {
    this.sweep();
    return this.runningJobId !== null;
  }

  get(jobId: string): ImportJob | undefined {
    this.sweep();
    return this.jobs.get(jobId);
  }

  /** Starts a new job running `importBook` in the background; returns the
   * job id immediately. Throws if a job is already running. */
  start(
    source: { bytes: Uint8Array; filename: string },
    opts: Omit<ImportOptions, 'onProgress' | 'signal'>,
  ): ImportJob {
    if (this.isBusy()) {
      throw new Error('an import is already running');
    }
    const id = randomUUID();
    const abort = new AbortController();
    const now = Date.now();
    const job: ImportJob = {
      id,
      status: 'running',
      createdAt: now,
      expiresAt: now + JOB_TTL_MS,
      deadline: now + this.jobMaxMs,
      events: [],
      listeners: new Set(),
      abort,
    };
    this.jobs.set(id, job);
    this.runningJobId = id;

    void importBook(source, {
      ...opts,
      signal: abort.signal,
      onProgress: (event) => {
        job.events.push(event);
        for (const listener of job.listeners) listener(event);
      },
    })
      .then((result) => {
        job.result = result;
        job.status = 'done';
        job.completedAt = Date.now();
        job.expiresAt = job.completedAt + JOB_TTL_MS;
      })
      .catch((err: unknown) => {
        if (job.status === 'running') {
          job.status = 'error';
          job.error = err instanceof Error ? err.message : String(err);
          job.completedAt = Date.now();
          job.expiresAt = job.completedAt + JOB_TTL_MS;
        }
      })
      .finally(() => {
        if (this.runningJobId === id) this.runningJobId = null;
      });

    return job;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.status === 'running' && job.deadline < now) {
        // Past its wall-clock ceiling: abort the pipeline and mark the job
        // failed so runningJobId clears and future POST /import requests
        // are not permanently 429'd by a hung run.
        job.abort.abort();
        job.status = 'error';
        job.error = 'import timed out';
        job.completedAt = now;
        job.expiresAt = now + JOB_TTL_MS;
        if (this.runningJobId === id) this.runningJobId = null;
        continue;
      }
      if (
        job.status !== 'running' &&
        job.audioFreedAt === undefined &&
        job.result &&
        job.completedAt !== undefined &&
        now - job.completedAt > AUDIO_RETENTION_MS
      ) {
        job.result.audio.clear();
        job.audioFreedAt = now;
      }
      if (job.expiresAt < now && job.status !== 'running') {
        this.jobs.delete(id);
        if (this.runningJobId === id) this.runningJobId = null;
      }
    }
  }
}
