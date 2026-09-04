#!/usr/bin/env node
/**
 * sotto-content — build, validate, narrate, and generate covers for
 * content packs (planning/CONTRACTS.md §2).
 *
 * WS-0 scaffold only: subcommands are stubs. WS-1/WS-5 implement the real
 * pipeline (packages/content/src/**).
 */
import { parseArgs } from 'node:util';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = path.join(__dirname, '..', 'packs');

function packsIsEmpty(): boolean {
  if (!existsSync(PACKS_DIR)) return true;
  return readdirSync(PACKS_DIR).filter((f) => !f.startsWith('.')).length === 0;
}

function main(): void {
  const { positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
  });
  const [command, bookId] = positionals;

  switch (command) {
    case 'build':
      console.log('sotto-content build: not implemented');
      process.exit(0);
      break;
    case 'validate':
      if (packsIsEmpty()) {
        console.log('sotto-content validate: packs/ is empty, nothing to validate');
        process.exit(0);
      }
      console.log('sotto-content validate: not implemented');
      process.exit(0);
      break;
    case 'narrate':
      console.log(`sotto-content narrate${bookId ? ` ${bookId}` : ''}: not implemented`);
      process.exit(0);
      break;
    case 'covers':
      console.log('sotto-content covers: not implemented');
      process.exit(0);
      break;
    default:
      console.error('usage: sotto-content <build|validate|narrate|covers> [bookId]');
      process.exit(1);
  }
}

main();
