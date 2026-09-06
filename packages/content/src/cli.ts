#!/usr/bin/env node
/**
 * sotto-content — build, validate, narrate, and generate covers for
 * content packs (planning/CONTRACTS.md §2).
 */
import { parseArgs } from 'node:util';
import { runBuildCommand } from './build.ts';
import { runValidateCommand, runValidateFixturesCommand } from './validate.ts';
import { runNarrateCommand } from './narrate.ts';
import { runWordAudioCommand } from './word-audio.ts';
import { runCoversCommand } from './covers.ts';
import { runAlignCommand } from './align-command.ts';
import { runTranslateSentencesCommand } from './translate-sentences.ts';
import { withBuildLock } from './build-lock.ts';
import { runNewCommand } from './scaffold.ts';
import { runImportCommand } from './import/cli-command.ts';

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      fill: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      fixtures: { type: 'boolean', default: false },
      locale: { type: 'string' },
      book: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      title: { type: 'string' },
      author: { type: 'string' },
      from: { type: 'string' },
      level: { type: 'string' },
      out: { type: 'string' },
      narrate: { type: 'string' },
    },
  });
  const [command, bookId] = positionals;

  switch (command) {
    case 'import':
      await runImportCommand({
        file: bookId,
        locale: values.locale,
        out: values.out,
        narrate: values.narrate,
      });
      break;
    case 'new':
      runNewCommand({
        bookId,
        locale: values.locale,
        title: values.title,
        author: values.author,
        from: values.from,
        level: values.level,
      });
      break;
    case 'build':
      await runBuildCommand({ fill: values.fill, only: bookId });
      break;
    case 'validate':
      if (values.fixtures) {
        runValidateFixturesCommand();
      } else {
        runValidateCommand();
      }
      break;
    case 'narrate':
      await runNarrateCommand({ bookId, force: values.force });
      break;
    case 'word-audio':
      await withBuildLock(() => runWordAudioCommand({ bookId, force: values.force }));
      break;
    case 'covers':
      runCoversCommand();
      break;
    case 'align':
      await withBuildLock(() => runAlignCommand({ locale: values.locale }));
      break;
    case 'translate-sentences':
      await withBuildLock(() =>
        runTranslateSentencesCommand({
          locale: values.locale,
          book: values.book,
          dryRun: values['dry-run'],
        }),
      );
      break;
    default:
      console.error(
        'usage: sotto-content <import|new|build|validate|narrate|word-audio|covers|align|translate-sentences> [bookId] [--fill] [--force] [--fixtures] [--locale xx] [--book id] [--dry-run] [--title ...] [--author ...] [--from file] [--level A0|A1|A2|B1|B2|C1] [--out dir] [--narrate none|first|all]',
      );
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
