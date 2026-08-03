/**
 * Pure helpers for the backup/restore scripts — counting, hashing, and the
 * sanity floor. No I/O, no CLI, no Firebase: everything here is a function of
 * its arguments so it can be unit-tested (`scripts/__tests__/snapshot.test.js`).
 *
 * CommonJS on purpose. The scripts themselves are ESM `.mjs` and import this
 * fine, while Jest requires it without needing ESM support turned on, and
 * `tsconfig.json` only includes `.ts`/`.tsx` so nothing here has to satisfy the
 * app's typecheck.
 */

const { createHash } = require('node:crypto');

/**
 * Below this, a backup is assumed to be a failure rather than a small database.
 *
 * The whole database was ~11 KB when this was written, so the floor is not a
 * size expectation — it is a tripwire for the failure this project has already
 * lived through twice: a command that reads the wrong instance, or runs with an
 * expired token, returns `null` or `{}` and that looks exactly like a result.
 * `docs/DATABASE_RUNBOOK.md` used to verify exports with "not 0 bytes", which a
 * 5-byte `null` passes.
 */
const MIN_PLAUSIBLE_BYTES = 500;

/** Top-level nodes a real snapshot of this database must contain at least one of. */
const EXPECTED_NODES = ['sales', 'quotes', 'payments', 'users', 'activity', 'settings'];

/**
 * Count the keys `depth` levels below `node`.
 *
 * Depth rather than field names, because the storage layout is the stable
 * thing: `sales/{YYYY}/{MM}/{DD}/{receiptId}` is three levels of bucket before
 * the record, whatever fields the record happens to carry.
 */
function countKeysAtDepth(node, depth) {
  if (!node || typeof node !== 'object') return 0;
  if (depth === 0) return Object.keys(node).length;
  return Object.values(node).reduce((sum, child) => sum + countKeysAtDepth(child, depth - 1), 0);
}

/** Sum one numeric field across every record `depth` levels below `node`. */
function sumFieldAtDepth(node, depth, field) {
  if (!node || typeof node !== 'object') return 0;
  if (depth === 0) {
    return Object.values(node).reduce((sum, record) => {
      const value = record && typeof record === 'object' ? record[field] : undefined;
      return sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    }, 0);
  }
  return Object.values(node).reduce((sum, child) => sum + sumFieldAtDepth(child, depth - 1, field), 0);
}

/**
 * What the snapshot contains, in terms someone can check against the app.
 *
 * The two totals are stored values summed for comparison only — they are not
 * recomputed and nothing is rounded here. Their job is to make "no money moved"
 * checkable across a backup/restore pair, the way the cancelled migration
 * reported a before/after ledger.
 */
function countNodes(root) {
  const db = root && typeof root === 'object' ? root : {};
  return {
    batches: countKeysAtDepth(db.sales, 3),
    quotes: countKeysAtDepth(db.quotes, 3),
    payments: countKeysAtDepth(db.payments, 2),
    activityEntries: countKeysAtDepth(db.activity, 0),
    users: countKeysAtDepth(db.users, 0),
    hasSettings: Boolean(db.settings),
    salesTotal: sumFieldAtDepth(db.sales, 3, 'totalAmount'),
    paymentsTotal: sumFieldAtDepth(db.payments, 2, 'amount'),
  };
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Reasons this payload must not be written as a backup. Empty array = write it.
 *
 * Returns every reason rather than the first, so a bad run explains itself in
 * one pass instead of one re-run per problem.
 */
function implausibleReasons(root, serialized, minBytes = MIN_PLAUSIBLE_BYTES) {
  const reasons = [];

  if (root === null || root === undefined) {
    reasons.push('the database returned null — almost always the wrong --instance, or an expired login');
    return reasons; // everything below would just restate this
  }
  if (typeof root !== 'object' || Array.isArray(root)) {
    reasons.push(`expected an object at the database root, got ${Array.isArray(root) ? 'an array' : typeof root}`);
    return reasons;
  }

  const present = EXPECTED_NODES.filter((name) => root[name] !== undefined);
  if (present.length === 0) {
    reasons.push(`no expected top-level node found (looked for: ${EXPECTED_NODES.join(', ')})`);
  }
  if (serialized.length < minBytes) {
    reasons.push(`payload is ${serialized.length} bytes, below the ${minBytes}-byte floor`);
  }
  return reasons;
}

/** The sidecar record that makes a backup verifiable rather than merely present. */
function buildManifest({ serialized, root, rules, instance, project, takenAt, label }) {
  return {
    takenAt,
    instance,
    project,
    label: label || null,
    bytes: serialized.length,
    sha256: sha256(serialized),
    counts: countNodes(root),
    // Rules travel with the manifest, not the data file: the data file stays a
    // plain database dump that `database:set` and the console's Import JSON can
    // both take. Rules are restored by `firebase deploy --only database`, never
    // by a data write.
    rules: rules ?? null,
  };
}

module.exports = {
  MIN_PLAUSIBLE_BYTES,
  EXPECTED_NODES,
  countKeysAtDepth,
  sumFieldAtDepth,
  countNodes,
  sha256,
  implausibleReasons,
  buildManifest,
};
