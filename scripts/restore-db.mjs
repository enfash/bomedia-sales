#!/usr/bin/env node
/**
 * Restore a backup taken by `scripts/backup-db.mjs`.
 *
 * DRY RUN BY DEFAULT. Nothing is written without `--commit`, and a target that
 * already holds data is refused even then unless `--force` is passed as well.
 * Restoring a stale backup over live data is a worse outcome than having no
 * backup at all: the loss is silent, and it destroys the newer records that
 * would have told you it happened.
 *
 * This writes as the project owner through the CLI, so the security rules do
 * NOT stand between it and your data. The dry run and the non-empty refusal are
 * the only guards. Read what it prints.
 *
 * REHEARSE IT. `bomedia-official-default-rtdb` — the project's other, empty
 * database — is the rehearsal target: same project, same deployed rules, no
 * production risk.
 *
 *   node scripts/restore-db.mjs <file> --instance bomedia-official-default-rtdb
 *   node scripts/restore-db.mjs <file> --instance bomedia-official-default-rtdb --commit
 *
 * Rules are NOT restored here. They live in the manifest for the record and are
 * deployed with `firebase deploy --only database`, never by a data write.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { countNodes, sha256 } = require('./lib/snapshot.js');

const execFileAsync = promisify(execFile);

const DEFAULT_PROJECT = 'bomedia-official';

function parseArgs(argv) {
  const args = { file: null, instance: null, project: DEFAULT_PROJECT, commit: false, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.split('=');
    const value = inline ?? argv[i + 1];
    const consume = () => {
      if (inline === undefined) i += 1;
      return value;
    };
    if (flag === '--instance') args.instance = consume();
    else if (flag === '--project') args.project = consume();
    else if (flag === '--commit') args.commit = true;
    else if (flag === '--force') args.force = true;
    else if (flag === '--help' || flag === '-h') args.help = true;
    else if (!arg.startsWith('--') && args.file === null) args.file = arg;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

async function readShallow(instance, project) {
  const { stdout } = await execFileAsync(
    'firebase',
    ['database:get', '/', '--shallow', '--instance', instance, '--project', project],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout.trim() || 'null');
  return parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
}

function describe(counts) {
  return `${counts.batches} batches, ${counts.payments} payments, ${counts.quotes} quotes, ` +
    `${counts.activityEntries} activity entries, ${counts.users} users ` +
    `(sales total ${counts.salesTotal}, payments total ${counts.paymentsTotal})`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    console.log('usage: node scripts/restore-db.mjs <backup.json> --instance X [--project Y] [--commit] [--force]');
    if (!args.file) process.exitCode = 1;
    return;
  }
  if (!args.instance) {
    // No default on purpose. Every other command in this project that let the
    // instance default silently hit the wrong database.
    throw new Error('--instance is required — name the database you mean to write to');
  }

  const serialized = (await readFile(args.file, 'utf8')).trim();
  const root = JSON.parse(serialized);
  const counts = countNodes(root);

  // If the manifest is beside the file, the payload must match its hash. A
  // backup that has been edited or truncated is not a backup.
  const manifestPath = args.file.replace(/\.json$/, '.manifest.json');
  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    console.warn(`warning: no manifest beside this file — restoring unverified\n  looked for ${manifestPath}`);
  }
  if (manifest) {
    const actual = sha256(serialized);
    if (actual !== manifest.sha256) {
      throw new Error(
        `hash mismatch — this file is not the one the manifest describes\n` +
        `  manifest ${manifest.sha256}\n  file     ${actual}`,
      );
    }
    console.log(`Verified against manifest (taken ${manifest.takenAt}, ${manifest.instance}).`);
  }

  const existing = await readShallow(args.instance, args.project);

  console.log(`\nRestore plan`);
  console.log(`  from    ${args.file}`);
  console.log(`  to      ${args.instance} (project ${args.project})`);
  console.log(`  content ${describe(counts)}`);
  console.log(`  target  ${existing.length ? `NOT EMPTY — holds ${existing.join(', ')}` : 'empty'}`);

  if (!args.commit) {
    console.log('\nDry run. Nothing written. Re-run with --commit to write.');
    if (existing.length) console.log('The target is not empty, so --commit will also need --force.');
    return;
  }

  if (existing.length && !args.force) {
    console.error(
      `\nRefusing to overwrite a database that already holds data (${existing.join(', ')}).` +
      `\nEverything currently there would be replaced by this file and lost.` +
      `\nIf that is genuinely what you want, add --force.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nWriting…');
  await execFileAsync(
    'firebase',
    ['database:set', '/', args.file, '--instance', args.instance, '--project', args.project, '--force'],
    { maxBuffer: 256 * 1024 * 1024 },
  );

  const after = await readShallow(args.instance, args.project);
  console.log(`Done. ${args.instance} now holds: ${after.join(', ') || '(nothing — check the output above)'}`);
  console.log('\nRules are not restored by this script. If they also need restoring:');
  console.log('  firebase deploy --only database');
}

main().catch((error) => {
  console.error(`\nRestore failed: ${error.message}`);
  process.exitCode = 1;
});
