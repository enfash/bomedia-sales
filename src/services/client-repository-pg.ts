/**
 * Client find-or-create — Postgres-backed, resolve-at-submit (decided, not
 * search-as-you-type — see supabase/README.md's "Cutover plan" step 6 for
 * why: the Sheets frequency-vote dedup seeds `clients` before cutover, so
 * the near-duplicates that matter already exist by the time anyone types a
 * name at the counter).
 *
 * `clients.name_key` (`20260829120200_tables.sql`) is a GENERATED, unique
 * column — `lower(regexp_replace(trim(name), '\s+', ' ', 'g'))` — computed
 * by Postgres from `name` on every insert. `nameKey()` below mirrors that
 * exact expression in JS so this can look an existing client up by it;
 * inserting never has to supply it, Postgres derives it automatically.
 *
 * NOT `client-identity.ts`'s `normalizeClientName` — that strips all
 * punctuation and whitespace entirely ("Blessing Prints" → "blessingprints"),
 * a different, incompatible key from Postgres's own ("blessing prints",
 * whitespace collapsed but kept). Keying against the wrong one would let the
 * same customer end up as two `clients` rows.
 */

import { supabase } from '@/lib/auth';

/** Mirrors `clients.name_key`'s generated-column expression exactly. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Find-or-create a client by name, returning its id. Same landed-vs-replay
 * shape as `create_sale`/`record_payment`: select first (the common case —
 * the client already exists, especially once Sheets dedup has seeded
 * `clients`), and only insert on a genuine miss, tolerating a concurrent
 * insert winning the race via `ignoreDuplicates` + a final re-select.
 */
export async function resolveClientId(name: string, contact?: string): Promise<string> {
  const trimmedName = name.trim();
  const key = nameKey(trimmedName);
  if (!key) throw new Error('A client name is required.');

  const { data: existing, error: selectError } = await supabase
    .from('clients')
    .select('id')
    .eq('name_key', key)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data: inserted, error: insertError } = await supabase
    .from('clients')
    .upsert({ name: trimmedName, contact: contact?.trim() || null }, { onConflict: 'name_key', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();
  if (insertError) throw insertError;
  if (inserted) return inserted.id;

  // A concurrent insert landed first between the select above and this
  // insert's conflict — re-select rather than treat that as a failure.
  const { data: afterConflict, error: reselectError } = await supabase
    .from('clients')
    .select('id')
    .eq('name_key', key)
    .maybeSingle();
  if (reselectError) throw reselectError;
  if (afterConflict) return afterConflict.id;

  throw new Error(`Could not resolve or create a client for "${trimmedName}".`);
}
