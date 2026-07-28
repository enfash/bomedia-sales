/**
 * One-time migration: legacy flat sales records -> hierarchical batch layout.
 *
 *   Legacy:  sales/{recordId} = { material, total, amountPaid, batchId?, ... }
 *   Target:  sales/{YYYY}/{MM}/{DD}/{receiptId} = { ...batch, items: { item_0, ... } }
 *
 * Records already stored as batch nodes (they contain an `items` map) are left
 * untouched, so this script is safe to run more than once (idempotent).
 *
 * Usage:
 *   node scripts/migrate-sales.mjs           # DRY RUN — prints a plan, writes nothing
 *   node scripts/migrate-sales.mjs --commit  # actually write the migrated tree
 *
 * After a successful --commit run and a sanity check in the app, delete the
 * `adaptLegacyRecords` shim in src/services/sales-repository.ts.
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, update } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyBy_iuT-YwyqyQwsa67_a6_0mmGtWdmgno',
  authDomain: 'bomedia-official.firebaseapp.com',
  databaseURL: 'https://bomedia-official.firebaseio.com',
  projectId: 'bomedia-official',
  storageBucket: 'bomedia-official.firebasestorage.app',
  messagingSenderId: '1054405810396',
  appId: '1:1054405810396:web:21cf8769eb3ef6de3abc19',
};

const COMMIT = process.argv.includes('--commit');

const isBatchNode = (n) =>
  n && typeof n === 'object' && n.items && typeof n.items === 'object' &&
  (n.clientName || n.receiptId || n.createdAt);

const isLegacyRecord = (n) =>
  n && typeof n === 'object' && !('items' in n) &&
  ('material' in n || 'width' in n || 'jobUnit' in n || 'total' in n);

function pad(n) {
  return String(n).padStart(2, '0');
}

function bucketFromDate(input) {
  const d = input ? new Date(input) : new Date();
  const safe = isNaN(d.getTime()) ? new Date() : d;
  return `${safe.getFullYear()}/${pad(safe.getMonth() + 1)}/${pad(safe.getDate())}`;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app, firebaseConfig.databaseURL);

  const snap = await get(ref(db, 'sales'));
  const root = snap.val();
  if (!root) {
    console.log('No data under /sales. Nothing to do.');
    process.exit(0);
  }

  // Collect legacy leaf records anywhere in the tree.
  const legacy = [];
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (isBatchNode(node)) return; // already migrated
    if (isLegacyRecord(node)) {
      legacy.push({ node, path });
      return;
    }
    for (const [k, child] of Object.entries(node)) walk(child, [...path, k]);
  };
  walk(root, []);

  if (legacy.length === 0) {
    console.log('✓ No legacy flat records found — storage is already hierarchical.');
    process.exit(0);
  }

  // Group legacy records into batches by batchId (fallback: their own id).
  const batches = {};
  for (const { node, path } of legacy) {
    const recordId = path[path.length - 1];
    const batchId = node.batchId || recordId;
    if (!batches[batchId]) {
      batches[batchId] = {
        receiptId: batchId,
        clientName: node.clientName || 'Unknown Client',
        contact: node.contact || '',
        createdAt: node.createdAt || new Date().toISOString(),
        totalAmount: 0,
        deliveryCost: 0,
        totalPaid: 0,
        paymentMethod: node.paymentMethod || 'Transfer',
        ...(node.notes ? { notes: node.notes } : {}),
        ...(node.dueDate ? { dueDate: node.dueDate } : {}),
        items: {},
        _oldPaths: [],
      };
    }
    const batch = batches[batchId];
    const idx = Object.keys(batch.items).length;
    const { batchId: _b, amountPaid, clientName, contact, createdAt, ...itemFields } = node;
    batch.items[`item_${idx}`] = itemFields;
    batch.totalAmount += Number(node.total) || 0;
    batch.totalPaid += Number(amountPaid) || 0;
    batch._oldPaths.push(`sales/${path.join('/')}`);
  }

  const updates = {};
  let batchCount = 0;
  console.log(`\nMigration plan (${legacy.length} legacy records -> ${Object.keys(batches).length} batches):\n`);
  for (const [batchId, batch] of Object.entries(batches)) {
    const { _oldPaths, ...clean } = batch;
    const bucket = bucketFromDate(clean.createdAt);
    const target = `sales/${bucket}/${batchId}`;
    console.log(`  • ${batchId}  ->  ${target}  (${Object.keys(clean.items).length} items, ₦${clean.totalAmount})`);
    updates[target] = clean;
    for (const old of _oldPaths) {
      if (old !== target) updates[old] = null; // remove the old flat node
    }
    batchCount++;
  }

  if (!COMMIT) {
    console.log(`\nDRY RUN — nothing written. Re-run with --commit to apply (${batchCount} batches).`);
    process.exit(0);
  }

  await update(ref(db), updates);
  console.log(`\n✓ Committed ${batchCount} batches. Verify in the app, then delete the legacy shim.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
