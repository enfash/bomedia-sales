/**
 * One-time wipe of test data from the Realtime Database.
 *
 * Usage:
 *   npm run wipe:test-data                      # DRY RUN — prints, deletes nothing
 *   npm run wipe:test-data -- --commit
 *   npm run wipe:test-data -- --include-expenses [--commit]
 *
 * REQUIRES a service account:
 *   export GOOGLE_APPLICATION_CREDENTIALS=./secrets/bomedia-service-account.json
 *
 * WHY THE ADMIN SDK: root is `.write: false` and no rule grants write at
 * `sales` / `quotes` / `activity` root depth, so no signed-in user — admin
 * included — can remove these nodes. See docs/MIGRATION_RUNBOOK.md.
 *
 * TAKE A FULL DATABASE EXPORT FIRST. This is not reversible.
 */

import { cert, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { readFileSync } from 'node:fs';

const DATABASE_URL = 'https://bomedia-official.firebaseio.com';

/**
 * Nodes this script is permitted to touch. Anything not listed here cannot be
 * deleted by this script under any flag.
 */
const WIPEABLE = ['sales', 'quotes', 'activity', 'expenses'] as const;

/**
 * Nodes that must NEVER be deleted, checked twice: once when building the
 * target list and once immediately before the delete call.
 *
 *   users    — holds the admin role every database rule reads. Removing it
 *              locks the account out of every write in the app.
 *   settings — the material price list, printers and business profile. Not
 *              transactional data; losing it means re-entering all of it.
 */
const PROTECTED = ['users', 'settings'] as const;

const COMMIT = process.argv.includes('--commit');
const INCLUDE_EXPENSES = process.argv.includes('--include-expenses');

const naira = (n: number) => `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

function die(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function connect() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    die(
      'GOOGLE_APPLICATION_CREDENTIALS is not set.\n' +
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

/** Walk a subtree and describe what is actually in it. */
function describe(node: string, value: any) {
  const lines: string[] = [];
  let count = 0;
  let total = 0;

  const walk = (n: any, path: string[]) => {
    if (!n || typeof n !== 'object') return;

    if (node === 'sales' || node === 'quotes') {
      if (n.items && typeof n.items === 'object') {
        count++;
        total += Number(n.totalAmount) || 0;
        lines.push(
          `      ${path.join('/').padEnd(34)} ${String(n.clientName ?? '?').padEnd(18)} ` +
          `${naira(Number(n.totalAmount) || 0).padStart(14)}`,
        );
        return;
      }
    }
    if (node === 'expenses' && n.amount !== undefined) {
      count++;
      total += Number(n.amount) || 0;
      lines.push(
        `      ${path.join('/').padEnd(34)} ${String(n.category ?? '?').padEnd(22)} ` +
        `${naira(Number(n.amount) || 0).padStart(14)}`,
      );
      return;
    }
    if (node === 'activity' && n.type !== undefined) {
      count++;
      lines.push(`      ${path.join('/').padEnd(34)} ${String(n.type)}`);
      return;
    }
    for (const [k, c] of Object.entries(n)) walk(c, [...path, k]);
  };

  walk(value, []);
  return { lines, count, total };
}

async function main() {
  const db = connect();

  const targets: string[] = ['sales', 'quotes', 'activity'];
  if (INCLUDE_EXPENSES) targets.push('expenses');

  // Guard 1 — nothing outside the allow-list, nothing on the protected list.
  for (const t of targets) {
    if ((PROTECTED as readonly string[]).includes(t)) {
      die(`Refusing to touch protected node "${t}". This script cannot delete it.`);
    }
    if (!(WIPEABLE as readonly string[]).includes(t)) {
      die(`"${t}" is not in the allow-list ${JSON.stringify(WIPEABLE)}.`);
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log(COMMIT ? 'WIPE — COMMIT' : 'WIPE — DRY RUN (nothing will be deleted)');
  console.log('='.repeat(72));

  let grandCount = 0;
  let grandTotal = 0;

  for (const node of targets) {
    const value = (await db.ref(node).get()).val();
    const { lines, count, total } = describe(node, value);
    grandCount += count;
    grandTotal += total;

    console.log(`\n  /${node}  — ${count} record(s)` + (total ? `, ${naira(total)}` : ''));
    if (lines.length === 0) console.log('      (empty)');
    else console.log(lines.join('\n'));
  }

  console.log(`\n  ${'─'.repeat(68)}`);
  console.log(`  TOTAL TO DELETE: ${grandCount} record(s) across ${targets.length} node(s)`);
  console.log(`  Monetary value destroyed: ${naira(grandTotal)}`);

  console.log(`\n  PROTECTED — not touched, verified after the wipe:`);
  for (const p of PROTECTED) {
    const v = (await db.ref(p).get()).val();
    console.log(`      /${p.padEnd(10)} ${v ? `${Object.keys(v).length} key(s) — present` : 'ABSENT'}`);
  }

  if (!INCLUDE_EXPENSES) {
    console.log(`\n  /expenses is NOT included. Pass --include-expenses to wipe it too.`);
  }

  if (!COMMIT) {
    console.log(`\n  DRY RUN — nothing deleted. Re-run with --commit once the figures above`);
    console.log(`  match what you expect. TAKE A FULL EXPORT FIRST.\n`);
    return;
  }

  // Guard 2 — re-checked immediately before the destructive call.
  for (const node of targets) {
    if ((PROTECTED as readonly string[]).includes(node)) {
      die(`Refusing to delete protected node "${node}".`);
    }
  }

  console.log(`\n  Deleting…`);
  for (const node of targets) {
    await db.ref(node).remove();
    console.log(`      removed /${node}`);
  }

  // ---- verification -----------------------------------------------------
  console.log(`\n  Verifying wiped nodes are empty…`);
  let bad = 0;
  for (const node of targets) {
    const after = (await db.ref(node).get()).val();
    if (after === null || after === undefined) {
      console.log(`      ✓ /${node} is empty`);
    } else {
      console.log(`      ✗ /${node} still has ${Object.keys(after).length} key(s)`);
      bad++;
    }
  }

  console.log(`\n  Verifying protected nodes are intact…`);
  for (const p of PROTECTED) {
    const after = (await db.ref(p).get()).val();
    if (after && Object.keys(after).length > 0) {
      console.log(`      ✓ /${p} intact — ${Object.keys(after).length} key(s)`);
      if (p === 'users') {
        for (const [uid, u] of Object.entries(after as any)) {
          console.log(`          ${uid}  role=${(u as any).role}  email=${(u as any).email}`);
        }
      }
    } else {
      console.log(`      ✗✗ /${p} IS MISSING OR EMPTY — this should be impossible`);
      bad++;
    }
  }

  if (bad > 0) die(`${bad} verification failure(s). Investigate before using the app.`);
  console.log(`\n✓ Wipe complete and verified. The database is clean.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nWipe failed:', err);
    process.exit(1);
  });
