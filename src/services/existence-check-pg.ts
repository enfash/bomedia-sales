/**
 * "Did this write reach the server?" — the Postgres counterpart to
 * existence-check.ts, for the new op kinds ('create_sale'/'record_payment')
 * that `sales-repository-pg.ts` / `payment-repository-pg.ts` construct.
 *
 * NOT YET WIRED into reconcile-pending.ts. That file's `reconcile()` takes a
 * single `ExistenceCheck` and applies it to every journal entry — correct
 * today, because the live app only ever journals Firebase-shaped entries
 * (the -pg repositories aren't called from any screen yet, per the "hold
 * everything until cutover" decision). Wiring a dispatcher that picks this
 * check vs. `dbService.existsOnServer` per entry is cutover-slice work, once
 * entries of both shapes can genuinely appear in the same journal. Until
 * then this module is exercised directly by tests, proving the same
 * journal → reconcile → replay path the Firebase side uses.
 *
 * WHY A NAMESPACED PATH. `ExistenceCheck` is `(path: string) => ...` — one
 * string, no access to the rest of the entry or its op. A bare
 * `payment_batches.id` or `sales.receipt_number` UUID/string can't say which
 * table to query. `journalEntryForPayment`/`journalEntryForSale` therefore
 * write `path` as `pg:<table>:<key>` for these op kinds — see `pgPath()`.
 *
 * WHAT THE ANSWERS MEAN — same three-state contract as existence-check.ts:
 * `true` = landed, `false` = missing (queried cleanly, no such row —
 * PostgREST's `.maybeSingle()` returning null data with no error), `null` =
 * could not tell (query error: expired session, RLS, network, wrong shape).
 * The asymmetry is the same one that module documents: only a clean "no such
 * row" answer may ever produce `missing`, because `missing` drives replay
 * and — for these RPCs — a re-post the operator already took cash for.
 */

import { supabase } from '@/lib/auth';

const PG_PREFIX = 'pg:';

type PgTable = 'sales' | 'payment_batches';

/** Build the namespaced journal path for a Postgres-backed entry. */
export function pgPath(table: PgTable, key: string): string {
  return `${PG_PREFIX}${table}:${key}`;
}

function parsePgPath(path: string): { table: PgTable; key: string } | null {
  if (!path.startsWith(PG_PREFIX)) return null;
  const rest = path.slice(PG_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return null;
  const table = rest.slice(0, sep);
  const key = rest.slice(sep + 1);
  if (!key) return null;
  if (table === 'sales' || table === 'payment_batches') return { table, key };
  return null;
}

/**
 * `true` = landed, `false` = missing, `null` = could not tell.
 *
 * Paths this doesn't recognise (not `pg:`-prefixed, or an unknown table)
 * return `null` rather than `false` — an unrecognised path is not evidence
 * of anything, and must never be treated as proof a write is missing.
 */
export async function checkExistsOnServerPg(path: string): Promise<boolean | null> {
  const parsed = parsePgPath(path);
  if (!parsed) return null;

  try {
    // Two separate typed calls rather than a dynamic table+column pair —
    // supabase-js resolves `.eq()`'s column type from `.from()`'s literal
    // argument, and a union table name collapses that to columns common to
    // both tables, which `receipt_number` isn't.
    const { data, error } =
      parsed.table === 'sales'
        ? await supabase.from('sales').select('id').eq('receipt_number', parsed.key).maybeSingle()
        : await supabase.from('payment_batches').select('id').eq('id', parsed.key).maybeSingle();

    if (error) return null;
    return data !== null;
  } catch {
    return null; // network failure, expired session, etc.
  }
}
