/**
 * `resolveClientId` — tested without a real Postgres connection. The risky
 * part is the landed-vs-replay shape (select, insert-on-conflict, re-select
 * on a lost race), not the SQL itself — that's proven live separately.
 */

import { nameKey, resolveClientId } from '@/services/client-repository-pg';

const mockMaybeSingle = jest.fn();
const chain: any = {
  select: jest.fn(() => chain),
  eq: jest.fn(() => chain),
  upsert: jest.fn(() => chain),
  maybeSingle: () => mockMaybeSingle(),
};
const mockFrom = jest.fn((_table: string) => chain);

jest.mock('@/lib/auth', () => ({ supabase: { from: (table: string) => mockFrom(table) } }));

beforeEach(() => {
  mockFrom.mockClear();
  chain.select.mockClear();
  chain.eq.mockClear();
  chain.upsert.mockClear();
  mockMaybeSingle.mockReset();
});

describe('nameKey', () => {
  it('mirrors the generated column: lowercase, trimmed, collapsed whitespace', () => {
    expect(nameKey('  Blessing   Prints ')).toBe('blessing prints');
    expect(nameKey('BLESSING PRINTS')).toBe('blessing prints');
  });

  it('does NOT strip punctuation — different from client-identity.ts on purpose', () => {
    expect(nameKey("O'Brien & Sons")).toBe("o'brien & sons");
  });
});

describe('resolveClientId', () => {
  it('returns the existing id on a match, without attempting an insert', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'existing-id' }, error: null });

    const id = await resolveClientId('Blessing Prints');

    expect(id).toBe('existing-id');
    expect(chain.upsert).not.toHaveBeenCalled();
  });

  it('creates a new client on a genuine miss', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // select: no match
      .mockResolvedValueOnce({ data: { id: 'new-id' }, error: null }); // insert: created

    const id = await resolveClientId('Brand New Client', '08012345678');

    expect(id).toBe('new-id');
    expect(chain.upsert).toHaveBeenCalledWith(
      { name: 'Brand New Client', contact: '08012345678' },
      { onConflict: 'name_key', ignoreDuplicates: true },
    );
  });

  it('re-selects when a concurrent insert wins the race (ignoreDuplicates returns nothing)', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // select: no match yet
      .mockResolvedValueOnce({ data: null, error: null }) // insert: lost the race, nothing returned
      .mockResolvedValueOnce({ data: { id: 'winner-id' }, error: null }); // re-select: finds it

    const id = await resolveClientId('Contested Name');

    expect(id).toBe('winner-id');
  });

  it('rejects an empty/whitespace-only name before any query', async () => {
    await expect(resolveClientId('   ')).rejects.toThrow(/name is required/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('propagates a select error rather than falling through to insert', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(resolveClientId('Some Client')).rejects.toEqual({ message: 'boom' });
    expect(chain.upsert).not.toHaveBeenCalled();
  });
});
