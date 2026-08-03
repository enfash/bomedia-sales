/**
 * The backup script's judgement, tested without touching a database.
 *
 * The interesting case is not "does it count correctly" — it is "does it refuse
 * the shapes that already fooled this project". A wrong `--instance` returns
 * `null`, an expired login returns nothing, and both look like success from the
 * outside. `docs/DATABASE_RUNBOOK.md` verified exports with "not 0 bytes",
 * which a 5-byte `null` passes.
 */

const {
  MIN_PLAUSIBLE_BYTES,
  countKeysAtDepth,
  countNodes,
  implausibleReasons,
  buildManifest,
  sha256,
} = require('../lib/snapshot.js');

/** A miniature of the real layout: sales/{Y}/{M}/{D}/{receiptId}. */
const db = {
  sales: {
    2026: {
      '08': {
        '02': {
          'INV-260802-AAAA': { receiptId: 'INV-260802-AAAA', totalAmount: 1000, totalPaid: 400 },
          'INV-260802-BBBB': { receiptId: 'INV-260802-BBBB', totalAmount: 2500, totalPaid: 0 },
        },
        '03': {
          'INV-260803-CCCC': { receiptId: 'INV-260803-CCCC', totalAmount: 600, totalPaid: 600 },
        },
      },
    },
  },
  quotes: { 2026: { '08': { '02': { 'QT-260802-ZZZZ': { quoteId: 'QT-260802-ZZZZ' } } } } },
  payments: {
    '2026-08-02': {
      'uid-a': { '-K1': { amount: 400, method: 'Cash' }, '-K2': { amount: 600, method: 'POS' } },
      'uid-b': { '-K3': { amount: 250, method: 'Transfer' } },
    },
  },
  activity: { '-A1': { type: 'sale_created' }, '-A2': { type: 'payment_recorded' } },
  users: { 'uid-a': { role: 'admin' }, 'uid-b': { role: 'staff' } },
  settings: { businessName: 'BOMedia' },
};

describe('countNodes', () => {
  it('counts records under their date buckets, not the buckets', () => {
    const counts = countNodes(db);
    expect(counts.batches).toBe(3);
    expect(counts.quotes).toBe(1);
    expect(counts.payments).toBe(3);
    expect(counts.activityEntries).toBe(2);
    expect(counts.users).toBe(2);
    expect(counts.hasSettings).toBe(true);
  });

  it('sums stored money so a backup and a restore can be compared', () => {
    const counts = countNodes(db);
    expect(counts.salesTotal).toBe(4100);
    expect(counts.paymentsTotal).toBe(1250);
  });

  it('reports zeros rather than throwing on an empty database', () => {
    const counts = countNodes({});
    expect(counts.batches).toBe(0);
    expect(counts.salesTotal).toBe(0);
    expect(counts.hasSettings).toBe(false);
  });

  it('ignores non-numeric money fields instead of coercing them', () => {
    const dirty = { sales: { 2026: { '08': { '02': { X: { totalAmount: '1000' } } } } } };
    expect(countNodes(dirty).salesTotal).toBe(0);
  });
});

describe('countKeysAtDepth', () => {
  it('is depth-based, so a record with unexpected fields still counts', () => {
    expect(countKeysAtDepth(db.sales, 3)).toBe(3);
  });

  it('returns 0 for a missing branch', () => {
    expect(countKeysAtDepth(undefined, 3)).toBe(0);
  });
});

describe('implausibleReasons — the shapes that have already fooled us', () => {
  it('rejects null, and says why it usually happens', () => {
    const reasons = implausibleReasons(null, 'null');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/--instance|expired/);
  });

  it('rejects an empty object with no recognised node', () => {
    const reasons = implausibleReasons({}, '{}');
    expect(reasons.join(' ')).toMatch(/no expected top-level node/);
  });

  it('rejects a payload under the floor even when it parses', () => {
    const tiny = { sales: {} };
    const reasons = implausibleReasons(tiny, JSON.stringify(tiny));
    expect(reasons.join(' ')).toMatch(/below the \d+-byte floor/);
  });

  it('reports every reason at once rather than one per run', () => {
    expect(implausibleReasons({}, '{}').length).toBeGreaterThan(1);
  });

  it('accepts a real snapshot', () => {
    const serialized = JSON.stringify(db).padEnd(MIN_PLAUSIBLE_BYTES, ' ');
    expect(implausibleReasons(db, serialized)).toEqual([]);
  });

  it('rejects an array root — valid JSON, wrong thing entirely', () => {
    expect(implausibleReasons([], '[]').join(' ')).toMatch(/expected an object/);
  });
});

describe('buildManifest', () => {
  const serialized = JSON.stringify(db);
  const manifest = buildManifest({
    serialized,
    root: db,
    rules: { rules: { '.read': false } },
    instance: 'bomedia-official',
    project: 'bomedia-official',
    takenAt: '2026-08-03T10:00:00.000Z',
    label: 'pre-migration',
  });

  it('hashes the exact bytes written, so a truncated file fails verification', () => {
    expect(manifest.sha256).toBe(sha256(serialized));
    expect(manifest.sha256).not.toBe(sha256(`${serialized} `));
  });

  it('records the instance, because the wrong one is the failure mode', () => {
    expect(manifest.instance).toBe('bomedia-official');
  });

  it('carries the rules for the record, separate from the data file', () => {
    expect(manifest.rules).toEqual({ rules: { '.read': false } });
  });

  it('carries the counts a restore can be checked against', () => {
    expect(manifest.counts.batches).toBe(3);
    expect(manifest.bytes).toBe(serialized.length);
  });
});
