#!/usr/bin/env node
/**
 * Take a verifiable backup of the Realtime Database.
 *
 * WHY THIS EXISTS. There is exactly one copy of the business's history, in one
 * Firebase project. On 2026-08-01 two genuine orders were deleted with the test
 * data and no pre-wipe export could be found (`docs/INCIDENT_2026-08-01-data-loss.md`).
 * The rules deployed since stop a CLIENT removing a financial record; they do
 * nothing about an owner, the console, or this CLI.
 *
 * WHAT IT WRITES. Two files per run:
 *
 *   bomedia-<instance>-<UTC timestamp>[-label].json           the database, plain
 *   bomedia-<instance>-<UTC timestamp>[-label].manifest.json  hash, counts, rules
 *
 * The data file is deliberately a bare dump with nothing wrapped around it, so
 * it can be restored by this repo's restore script, by `firebase database:set`,
 * or by the console's Import JSON — a backup that only one tool can read is a
 * dependency, not a safety net.
 *
 * WHAT IT REFUSES. A null payload, a root that is not an object, no recognised
 * top-level node, or anything under the size floor. Those are the shapes a
 * wrong `--instance` and an expired login produce, and both look like success
 * from the outside. It exits non-zero and writes nothing.
 *
 * Usage:
 *   node scripts/backup-db.mjs                       # ~/bomedia-backups
 *   node scripts/backup-db.mjs --label pre-migration
 *   node scripts/backup-db.mjs --out /Volumes/usb/bomedia
 */

import { execFile } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildManifest, implausibleReasons } = require('./lib/snapshot.js');

const execFileAsync = promisify(execFile);

const DEFAULT_INSTANCE = 'bomedia-official';
const DEFAULT_PROJECT = 'bomedia-official';

function parseArgs(argv) {
  const args = { instance: DEFAULT_INSTANCE, project: DEFAULT_PROJECT, out: null, label: null };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=');
    const value = inline ?? argv[i + 1];
    const consume = () => {
      if (inline === undefined) i += 1;
      return value;
    };
    if (flag === '--instance') args.instance = consume();
    else if (flag === '--project') args.project = consume();
    else if (flag === '--out') args.out = consume();
    else if (flag === '--label') args.label = consume();
    else if (flag === '--help' || flag === '-h') args.help = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return args;
}

/**
 * Read a path from the database.
 *
 * `--instance` is always passed explicitly. This project has two databases and
 * the CLI silently targets the empty one when nothing names it — that is how
 * the security rules came to be deployed to a database nobody uses.
 */
async function readPath(path, { instance, project }) {
  const { stdout } = await execFileAsync(
    'firebase',
    ['database:get', path, '--instance', instance, '--project', project],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  return stdout;
}

function timestamp(date) {
  // UTC, filename-safe, and sorts chronologically as a string.
  return date.toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
}

function formatCounts(counts) {
  return [
    `  batches          ${counts.batches}`,
    `  payments         ${counts.payments}`,
    `  quotes           ${counts.quotes}`,
    `  activity entries ${counts.activityEntries}`,
    `  users            ${counts.users}`,
    `  settings         ${counts.hasSettings ? 'present' : 'MISSING'}`,
    `  sales total      ${counts.salesTotal}`,
    `  payments total   ${counts.paymentsTotal}`,
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('usage: node scripts/backup-db.mjs [--instance X] [--project Y] [--out DIR] [--label TEXT]');
    return;
  }

  const outDir = args.out || join(homedir(), 'bomedia-backups');
  const takenAt = new Date();

  console.log(`Reading ${args.instance} (project ${args.project})…`);

  const serialized = (await readPath('/', args)).trim();

  let root;
  try {
    root = JSON.parse(serialized);
  } catch {
    throw new Error('the database returned something that is not JSON — run the command by hand to see it');
  }

  const reasons = implausibleReasons(root, serialized);
  if (reasons.length > 0) {
    console.error('\nRefusing to write this backup:');
    for (const reason of reasons) console.error(`  - ${reason}`);
    console.error('\nNothing was written. Fix the cause rather than lowering the floor:');
    console.error(`  firebase database:get / --instance ${args.instance} --project ${args.project} | head -c 200`);
    process.exitCode = 1;
    return;
  }

  // Rules are captured for the record, not for restoring. They were wrong on
  // this project for months and nobody could tell, because nothing kept a copy
  // of what was actually live.
  let rules = null;
  try {
    rules = JSON.parse((await readPath('/.settings/rules', args)).trim());
  } catch {
    console.warn('warning: could not read the live rules — backing up data only');
  }

  const manifest = buildManifest({
    serialized,
    root,
    rules,
    instance: args.instance,
    project: args.project,
    takenAt: takenAt.toISOString(),
    label: args.label,
  });

  const stem = `bomedia-${args.instance}-${timestamp(takenAt)}${args.label ? `-${args.label}` : ''}`;
  const dataPath = join(outDir, `${stem}.json`);
  const manifestPath = join(outDir, `${stem}.manifest.json`);

  await mkdir(outDir, { recursive: true });

  // Write to a temp name and rename, so an interrupted run cannot leave a
  // half-written file that looks like a backup.
  await writeFile(`${dataPath}.partial`, serialized, 'utf8');
  await rename(`${dataPath}.partial`, dataPath);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`\nBacked up ${manifest.bytes} bytes`);
  console.log(formatCounts(manifest.counts));
  console.log(`\n  sha256 ${manifest.sha256}`);
  console.log(`\n  ${dataPath}`);
  console.log(`  ${manifestPath}`);
  console.log('\nA backup nobody has restored from is a hypothesis. Rehearse it:');
  console.log(`  node scripts/restore-db.mjs ${dataPath} --instance bomedia-official-default-rtdb`);
}

main().catch((error) => {
  console.error(`\nBackup failed: ${error.message}`);
  if (/ENOENT/.test(error.message)) {
    console.error('Is the Firebase CLI installed and on PATH? `npm i -g firebase-tools`');
  }
  if (/401|credential|login/i.test(error.message)) {
    console.error('The CLI login may have expired: `firebase login --reauth`');
  }
  process.exitCode = 1;
});
