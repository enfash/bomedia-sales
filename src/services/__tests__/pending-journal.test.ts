/**
 * The pending-write journal — the part of Stage 5 that recovers money.
 *
 * What is being pinned here is not "does it store things". It is the four
 * behaviours the audit says turn this from a safety net into a silent loss if
 * any of them is wrong:
 *
 *   1. The entry is written BEFORE the write is issued.
 *   2. It is cleared on the ack.
 *   3. Reconciliation distinguishes landed / missing / UNVERIFIED — a failed
 *      read is never reported as a lost payment.
 *   4. A failed journal write degrades the safety net; it does not refuse the
 *      sale.
 */

import {
  __resetForTests,
  clear,
  journalled,
  list,
  reconcile,
  register,
  type JournalEntry,
} from '@/services/pending-journal';

/**
 * In-memory AsyncStorage that can be made to fail on demand. Named `mock…` so
 * jest's out-of-scope guard allows the factory below to reach it.
 */
const mockStore = new Map<string, string>();
const mockState = { failWrites: false };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      if (mockState.failWrites) throw new Error('storage full');
      mockStore.set(k, v);
    },
    removeItem: async (k: string) => {
      mockStore.delete(k);
    },
    getAllKeys: async () => [...mockStore.keys()],
    multiGet: async (keys: string[]) => keys.map((k) => [k, mockStore.get(k) ?? null]),
  },
}));

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  key: '-K1',
  path: 'payments/2026-08-03/uid-a/-K1',
  kind: 'payment',
  amount: 5000,
  method: 'Cash',
  receiptId: 'INV-260803-AAAA',
  byUid: 'uid-a',
  byName: 'Office',
  at: '2026-08-03T10:00:00.000Z',
  atMs: 1_754_215_200_000,
  ...over,
});

beforeEach(async () => {
  mockStore.clear();
  mockState.failWrites = false;
  await __resetForTests();
});

describe('1. the entry is written before the write is issued', () => {
  it('registers, THEN issues — never the other way round', async () => {
    const order: string[] = [];
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await journalled(entry(), async () => {
      // If registration were concurrent or after, the journal would be empty
      // here — and a crash at this instant would leave no evidence at all.
      const inFlight = await list();
      order.push(inFlight.length === 1 ? 'registered-first' : 'NOT-registered');
      order.push('write-issued');
    });

    expect(order).toEqual(['registered-first', 'write-issued']);
  });

  it('keeps the human context needed to re-enter it by hand', async () => {
    await register(entry());
    const [saved] = await list();
    expect(saved.amount).toBe(5000);
    expect(saved.method).toBe('Cash');
    expect(saved.receiptId).toBe('INV-260803-AAAA');
    expect(saved.byName).toBe('Office');
  });

  it('does not interleave two writes registered at once', async () => {
    // One storage key PER ENTRY, so there is no read-modify-write for a second
    // registration — or a second browser tab, which an in-process lock could
    // not reach — to interleave with and clobber.
    await Promise.all([
      register(entry({ key: '-K1' })),
      register(entry({ key: '-K2' })),
      register(entry({ key: '-K3' })),
    ]);
    expect((await list()).map((e) => e.key).sort()).toEqual(['-K1', '-K2', '-K3']);
  });
});

describe('2. it is cleared on the ack', () => {
  it('leaves nothing behind when the write resolves', async () => {
    await journalled(entry(), async () => 'ok');
    expect(await list()).toEqual([]);
  });

  it('clears on rejection too — a refused write did not land, and was seen', async () => {
    await expect(
      journalled(entry(), async () => {
        throw new Error('PERMISSION_DENIED');
      }),
    ).rejects.toThrow('PERMISSION_DENIED');
    // The operator saw the error. Asking them at next launch to re-enter money
    // they watched fail is noise, and noise is how a real warning gets ignored.
    expect(await list()).toEqual([]);
  });

  it('survives a write that never settles — the failure it exists for', async () => {
    let release: () => void = () => {};
    const hung = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inFlight = journalled(entry(), () => hung);

    // Offline: the promise never settles, so the entry is still there. This is
    // the state a force-quit turns into a lost payment.
    expect(await list()).toHaveLength(1);
    release();
    await inFlight;
    expect(await list()).toEqual([]);
  });
});

describe('3. reconciliation has three answers, not two', () => {
  it('clears silently when the write landed — only the ack was lost', async () => {
    await register(entry());
    const result = await reconcile(async () => true);

    expect(result.landed.map((e) => e.key)).toEqual(['-K1']);
    expect(result.missing).toEqual([]);
    expect(await list()).toEqual([]);
  });

  it('surfaces a write that never reached the server, and KEEPS it', async () => {
    await register(entry());
    const result = await reconcile(async () => false);

    expect(result.missing.map((e) => e.key)).toEqual(['-K1']);
    // Kept: closing the app must not also close the only record that a payment
    // may be missing.
    expect(await list()).toHaveLength(1);
  });

  it('treats a failed read as UNVERIFIED, never as missing', async () => {
    await register(entry());
    const result = await reconcile(async () => null);

    expect(result.unverified.map((e) => e.key)).toEqual(['-K1']);
    expect(result.missing).toEqual([]);
    expect(await list()).toHaveLength(1);
  });

  it('treats a THROWN check as unverified too', async () => {
    await register(entry());
    const result = await reconcile(async () => {
      throw new Error('offline');
    });

    expect(result.unverified).toHaveLength(1);
    expect(result.missing).toEqual([]);
  });

  it('sorts one batch of entries into all three buckets', async () => {
    await register(entry({ key: '-LANDED', path: 'p/landed' }));
    await register(entry({ key: '-MISSING', path: 'p/missing' }));
    await register(entry({ key: '-UNKNOWN', path: 'p/unknown' }));

    const result = await reconcile(async (path) => {
      if (path === 'p/landed') return true;
      if (path === 'p/missing') return false;
      return null;
    });

    expect(result.landed.map((e) => e.key)).toEqual(['-LANDED']);
    expect(result.missing.map((e) => e.key)).toEqual(['-MISSING']);
    expect(result.unverified.map((e) => e.key)).toEqual(['-UNKNOWN']);
    expect((await list()).map((e) => e.key).sort()).toEqual(['-MISSING', '-UNKNOWN']);
  });
});

describe('4. a failed journal write degrades, it does not block', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('lets the sale through when storage refuses', async () => {
    mockState.failWrites = true;
    const result = await journalled(entry(), async () => 'sale-recorded');
    // Degraded safety net, not a refused payment: the customer is standing there.
    expect(result).toBe('sale-recorded');
  });

  it('register never throws', async () => {
    mockState.failWrites = true;
    await expect(register(entry())).resolves.toBeUndefined();
  });

  it('clear never throws', async () => {
    await register(entry());
    mockState.failWrites = true;
    await expect(clear('-K1')).resolves.toBeUndefined();
  });

  it('survives corrupt storage rather than failing the write', async () => {
    mockStore.set('bomedia:pending-journal:v1:-K1', '{not json');
    expect(await list()).toEqual([]);
    await expect(journalled(entry(), async () => 'ok')).resolves.toBe('ok');
  });
});

describe('the journal is per device, and per-key within it', () => {
  it('does not clobber an entry another process wrote between our calls', async () => {
    // Two browser tabs share one localStorage, and an in-process lock cannot
    // reach across them. With one key per entry there is nothing to clobber:
    // this simulates the other tab writing directly into storage mid-flight.
    await register(entry({ key: '-MINE' }));
    mockStore.set(
      'bomedia:pending-journal:v1:-THEIRS',
      JSON.stringify(entry({ key: '-THEIRS' })),
    );
    await register(entry({ key: '-MINE-2' }));

    expect((await list()).map((e) => e.key).sort()).toEqual(['-MINE', '-MINE-2', '-THEIRS']);
  });

  it('clearing one entry leaves every other one alone', async () => {
    await register(entry({ key: '-A' }));
    await register(entry({ key: '-B' }));
    await clear('-A');
    expect((await list()).map((e) => e.key)).toEqual(['-B']);
  });

  it('ignores keys belonging to anything else in storage', async () => {
    mockStore.set('bomedia:activity:lastSeen:uid-a', '123');
    mockStore.set('bomedia:records-filters', '{}');
    await register(entry({ key: '-K1' }));
    expect((await list()).map((e) => e.key)).toEqual(['-K1']);
  });

  it('drops a corrupt entry from the list but leaves it in storage', async () => {
    await register(entry({ key: '-GOOD' }));
    mockStore.set('bomedia:pending-journal:v1:-BAD', '{not json');

    expect((await list()).map((e) => e.key)).toEqual(['-GOOD']);
    // Still there: deleting it would destroy the only trace that something was
    // pending, which is the opposite of this module's job.
    expect(mockStore.has('bomedia:pending-journal:v1:-BAD')).toBe(true);
  });
});
