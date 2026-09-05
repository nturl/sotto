/**
 * In-memory import job store (planning/LEDGER.md "R3-I Importer"): one
 * `POST /import` starts a job, `GET /import/:jobId/events` streams its
 * progress over SSE, `GET /import/:jobId/result` returns the finished
 * pack. Mirrors voice/registry.ts's in-memory-map-with-TTL shape — this
 * server has no database and none is warranted for a single-machine,
 * localhost-only dev tool.
 */
import { randomUUID } from 'node:crypto';
import {
  importBook,
  type ImportOptions,
  type ImportProgress,
  type ImportResult,
} from '@sotto/content/import';

const JOB_TTL_MS = 30 * 60_000;

export type JobStatus = 'running' | 'done' | 'error';

export interface ImportJob {
  id: string;
  status: JobStatus;
  createdAt: number;
  expiresAt: number;
  events: ImportProgress[];
  result?: ImportResult;
  error?: string;
  listeners: Set<(event: ImportProgress) => void>;
}

/** At most one import runs at a time (LEDGER "jobs live in memory, one at
 * a time") — a single background LLM/TTS/STT pipeline is already enough
 * concurrent load against the local model stack. */
export class ImportJobRegistry {
  private readonly jobs = new Map<string, ImportJob>();
  private runningJobId: string | null = null;

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
    const job: ImportJob = {
      id,
      status: 'running',
      createdAt: Date.now(),
      expiresAt: Date.now() + JOB_TTL_MS,
      events: [],
      listeners: new Set(),
    };
    this.jobs.set(id, job);
    this.runningJobId = id;

    void importBook(source, {
      ...opts,
      onProgress: (event) => {
        job.events.push(event);
        for (const listener of job.listeners) listener(event);
      },
    })
      .then((result) => {
        job.result = result;
        job.status = 'done';
        job.expiresAt = Date.now() + JOB_TTL_MS;
      })
      .catch((err: unknown) => {
        job.status = 'error';
        job.error = err instanceof Error ? err.message : String(err);
        job.expiresAt = Date.now() + JOB_TTL_MS;
      })
      .finally(() => {
        if (this.runningJobId === id) this.runningJobId = null;
      });

    return job;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.expiresAt < now && job.status !== 'running') {
        this.jobs.delete(id);
        if (this.runningJobId === id) this.runningJobId = null;
      }
    }
  }
}
