/**
 * `existence-check-pg.ts` — dispatch and answer-mapping, without a real
 * Postgres connection. `true`/`false`/`null` must mean exactly what
 * `existence-check.ts` (the Firebase version) documents them meaning: only a
 * clean "no such row" answer may ever produce `false` (missing), because
 * `missing` is what drives replay.
 */

import { checkExistsOnServerPg, pgPath } from '@/services/existence-check-pg';

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn((_column: string, _value: string) => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn((_columns: string) => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect }));

jest.mock('@/lib/auth', () => ({ supabase: { from: (table: string) => mockFrom(table) } }));

beforeEach(() => {
  mockFrom.mockClear();
  mockEq.mockClear();
  mockSelect.mockClear();
  mockMaybeSingle.mockReset();
});

it('pgPath round-trips into the right table and column dispatch', async () => {
  mockMaybeSingle.mockResolvedValue({ data: { id: 'x' }, error: null });
  await checkExistsOnServerPg(pgPath('sales', 'INV-260830-AAAA'));
  expect(mockFrom).toHaveBeenCalledWith('sales');
  expect(mockEq).toHaveBeenCalledWith('receipt_number', 'INV-260830-AAAA');

  await checkExistsOnServerPg(pgPath('payment_batches', 'batch-1'));
  expect(mockFrom).toHaveBeenCalledWith('payment_batches');
  expect(mockEq).toHaveBeenCalledWith('id', 'batch-1');
});

it('a row present means landed (true)', async () => {
  mockMaybeSingle.mockResolvedValue({ data: { id: 'x' }, error: null });
  await expect(checkExistsOnServerPg(pgPath('sales', 'INV-1'))).resolves.toBe(true);
});

it('a clean "no such row" answer means missing (false) — the only thing that may', async () => {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(checkExistsOnServerPg(pgPath('sales', 'INV-1'))).resolves.toBe(false);
});

it('a query error means unverified (null), never missing — RLS/expired session must not read as lost', async () => {
  mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'JWT expired', code: 'PGRST301' } });
  await expect(checkExistsOnServerPg(pgPath('sales', 'INV-1'))).resolves.toBeNull();
});

it('a thrown network failure means unverified (null)', async () => {
  mockMaybeSingle.mockRejectedValue(new Error('network down'));
  await expect(checkExistsOnServerPg(pgPath('sales', 'INV-1'))).resolves.toBeNull();
});

it('a path that is not pg:-namespaced (a Firebase path) is not evidence of anything — null, not false', async () => {
  await expect(checkExistsOnServerPg('sales/2026/08/30/INV-1')).resolves.toBeNull();
  expect(mockFrom).not.toHaveBeenCalled();
});

it('an unrecognised table in a pg: path is also null, not false', async () => {
  await expect(checkExistsOnServerPg('pg:unknown_table:x')).resolves.toBeNull();
  expect(mockFrom).not.toHaveBeenCalled();
});
