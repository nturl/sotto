import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDotEnv } from './config.js';

describe('loadDotEnv', () => {
  let dir: string | undefined;

  afterEach(() => {
    delete process.env.SOTTO_PORT;
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it('sets an unset variable from the file', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'sotto-env-'));
    const envPath = path.join(dir, '.env');
    writeFileSync(envPath, 'SOTTO_PORT=8799\n');

    delete process.env.SOTTO_PORT;
    loadDotEnv(envPath);

    expect(process.env.SOTTO_PORT).toBe('8799');
  });

  it('does not overwrite a variable already set in the environment', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'sotto-env-'));
    const envPath = path.join(dir, '.env');
    writeFileSync(envPath, 'SOTTO_PORT=8799\n');

    process.env.SOTTO_PORT = '9999';
    loadDotEnv(envPath);

    expect(process.env.SOTTO_PORT).toBe('9999');
  });

  it('ignores a missing file', () => {
    expect(() => loadDotEnv('/nonexistent/path/.env')).not.toThrow();
  });
});
