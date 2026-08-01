/**
 * One-time migration: legacy flat sales records -> hierarchical batch layout.
 *
 *   Legacy:  sales/{recordId}                   = { material, total, amountPaid, ... }
 *   Target:  sales/{YYYY}/{MM}/{DD}/{receiptId} = StoredBatch (with items map)
 *
 * Usage:
 *   npm run migrate:sales            # DRY RUN — prints a plan, writes nothing
 *   npm run migrate:sales -- --commit
 *
 * REQUIRES a service account. See docs/MIGRATION_RUNBOOK.md.
 *   export GOOGLE_APPLICATION_CREDENTIALS=./secrets/bomedia-service-account.json
 *
 * WHY THE ADMIN SDK: the client SDK connects as an unauthenticated user, and
 * database.rules.json requires auth to read /sales. More importantly, deleting
 * the old flat nodes at sales/{recordId} is denied for EVERY role — the only
 * .write rule under sales sits at sales/$y/$m/$d/$id, and root is .write:false.
 * The Admin SDK bypasses rules, so the rules stay tight for the app. Do not
 * loosen them to accommodate a one-off script.
 *
 * All planning logic lives in src/services/migrations/legacy-sales-migration.ts
 * and is unit-tested there, including idempotence. This file is the I/O shell.
 */

import { cert, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { readFileSync } from 'node:fs';

import {
  planLegacyMigration,
  verifyWrittenBatch,
  type PlannedBatch,
} from '../src/services/migrations/legacy-sales-migration';

const DATABASE_URL = 'https://bomedia-official.firebaseio.com';
const COMMIT = process.argv.includes('--commit');

const naira = (n: number) =>
  `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

function die(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function connect() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    die(
      'GOOGLE_APPLICATION_CREDENTIALS is not set.\n' +
      '  See docs/MIGRATION_RUNBOOK.md for how to download the service account key.\n' +
      '  export GOOGLE_APPLICATION_CREDENTIALS=./secrets/bomedia-service-account.json',
    );
  }

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  } catch (err) {
    die(`Could not read the service account key at ${keyPath}\n  ${(err as Error).message}`);
  }

  initializeApp({ credential: cert(serviceAccount), databaseURL: DATABASE_URL });
  return getDatabase();
}

function printPlan(plan: ReturnType<typeof planLegacyMigration>) {
  console.log(
    `\nMigration plan — ${plan.legacyRecordCount} legacy record(s) -> ` +
    `${plan.batches.length} batch(es). ${plan.alreadyMigrated} already migrated.\n`,
  );

  for (const batch of plan.batches) {
    console.log(`  ${batch.batchId}`);
    for (const old of batch.oldPaths) console.log(`    from : ${old}`);
    console.log(`    to   : ${batch.newPath}`);
    console.log(`    total: ${naira(batch.oldTotal)}  ->  ${naira(batch.newTotal)}` +
      (batch.oldTotal !== batch.newTotal ? '   (rounded)' : ''));
    if (batch.adjustments.length > 0) {
      for (const a of batch.adjustments) {
        console.log(`    adj  : ${a.label} ${a.amount < 0 ? '−' : '+'}${naira(Math.abs(a.amount))} [${a.kind}]`);
      }
    }
    console.log('');
  }

  console.log('  ' + '─'.repeat(64));
  console.log(`  Grand total before : ${naira(plan.grandTotalBefore)}`);
  console.log(`  Grand total after  : ${naira(plan.grandTotalAfter)}`);

  if (plan.grandTotalDelta === 0) {
    console.log(`  Delta              : ₦0  ✓ the books do not move`);
  } else {
    const sign = plan.grandTotalDelta > 0 ? '+' : '−';
    console.log('');
    console.log('  ' + '!'.repeat(64));
    console.log(`  !!  THE AGGREGATE MOVES BY ${sign}${naira(Math.abs(plan.grandTotalDelta))}`);
    console.log('  !!  Rounding line totals to whole naira has changed the sum of');
    console.log('  !!  the books. Review the per-record lines above before you commit.');
    console.log('  ' + '!'.repeat(64));
  }
  console.log('');
}

/**
 * COPY -> VERIFY -> DELETE, never a single atomic update.
 *
 * A multi-path update would be atomic, but atomicity is not the property we
 * want here: we want the ORIGINALS to survive anything going wrong. So each
 * batch is written, read straight back, and compared against what we planned.
 * The old nodes are only removed once every batch has verified. If any batch
 * fails, we stop with the originals fully intact and nothing deleted.
 */
async function commit(db: ReturnType<typeof getDatabase>, batches: PlannedBatch[]) {
  console.log(`Phase 1/3 — writing ${batches.length} new batch node(s)…`);
  for (const batch of batches) {
    await db.ref(batch.newPath).set(batch.node);
    console.log(`  wrote ${batch.newPath}`);
  }

  console.log(`\nPhase 2/3 — reading back and verifying…`);
  const failures: string[] = [];
  for (const batch of batches) {
    const snap = await db.ref(batch.newPath).get();
    const problems = verifyWrittenBatch(batch.node, snap.val());
    if (problems.length === 0) {
      console.log(`  ✓ ${batch.newPath}`);
    } else {
      console.log(`  ✗ ${batch.newPath}`);
      for (const p of problems) console.log(`      ${p}`);
      failures.push(batch.newPath);
    }
  }

  if (failures.length > 0) {
    die(
      `Verification failed for ${failures.length} batch(es).\n` +
      '  NOTHING HAS BEEN DELETED — every original flat record is still in place.\n' +
      '  The new nodes above were written and can be removed by hand if needed.\n' +
      '  Investigate before re-running.',
    );
  }

  console.log(`\nPhase 3/3 — removing the old flat records…`);
  let removed = 0;
  for (const batch of batches) {
    for (const old of batch.oldPaths) {
      if (old === batch.newPath) continue;
      await db.ref(old).remove();
      console.log(`  removed ${old}`);
      removed++;
    }
  }

  console.log(
    `\n✓ Migrated ${batches.length} batch(es); removed ${removed} legacy node(s).\n` +
    '  Verify in the app, then delete the adaptLegacyRecords shim in\n' +
    '  src/services/sales-repository.ts and its tests.\n',
  );
}

async function main() {
  const db = connect();

  const snap = await db.ref('sales').get();
  const root = snap.val();
  if (!root) {
    console.log('\nNo data under /sales. Nothing to do.\n');
    return;
  }

  const plan = planLegacyMigration(root);

  if (plan.batches.length === 0) {
    console.log(
      `\n✓ No legacy flat records found. ${plan.alreadyMigrated} batch(es) are already\n` +
      '  in the canonical layout, and nothing needs migrating.\n\n' +
      '  This migration is a NO-OP: you can delete the adaptLegacyRecords shim in\n' +
      '  src/services/sales-repository.ts outright.\n',
    );
    return;
  }

  printPlan(plan);

  if (!COMMIT) {
    console.log(`DRY RUN — nothing written. Re-run with --commit to apply.\n`);
    console.log(`  Take a full database export FIRST. See docs/MIGRATION_RUNBOOK.md.\n`);
    return;
  }

  await commit(db, plan.batches);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nMigration failed:', err);
    process.exit(1);
  });
