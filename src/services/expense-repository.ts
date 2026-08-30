/**
 * Expense repository — Postgres-backed. Part of the db.ts port (slice 2:
 * read-only proof; slice 3 wires this into the real screen and adds the
 * write side).
 *
 * `category` carries all 21 `expense_category` enum values — the app's
 * picker groups them into 6 UI sections, but that's a picker concern, not a
 * schema one; every value the enum allows is a legal `ExpenseRecord.category`.
 *
 * `loggedBy` is `expenses.logged_by_name`, a snapshot written at insert
 * time, not a join to `profiles.name` — see the migration that added that
 * column for why.
 */

import { supabase } from '@/lib/auth';
import type { Database } from '@/types/supabase';

type ExpenseCategory = Database['public']['Enums']['expense_category'];

/**
 * Canonical home for this shape going forward — `expenses.tsx` and
 * `use-expenses.ts` each currently declare their own identical copy
 * (pre-existing duplication, not introduced here). Slice 3 (the write
 * cutover) points both at this one instead of removing it now, so this
 * off-screen slice doesn't touch files nothing here calls yet.
 */
export interface ExpenseRecord {
  id: string;
  amount: number;
  category: string;
  description: string;
  loggedBy: string;
  uid?: string;
  createdAt: string;
  dbPath?: string;
}

function fromRow(row: {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  logged_by: string;
  logged_by_name: string;
  created_at: string;
}): ExpenseRecord {
  return {
    id: row.id,
    amount: row.amount,
    category: row.category,
    description: row.description ?? '',
    loggedBy: row.logged_by_name,
    uid: row.logged_by,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = 'id, amount, category, description, logged_by, logged_by_name, created_at';

/**
 * One-shot fetch of every expense in a given month, newest first — the
 * Postgres equivalent of subscribing to `expenses/{YYYY-MM}`. `monthKey` is
 * `YYYY-MM`, matching what the screen already passes today.
 *
 * Not realtime (out of scope for this port); callers refresh via
 * pull-to-refresh, same pattern as the activity feed.
 */
export async function fetchExpensesForMonth(monthKey: string): Promise<ExpenseRecord[]> {
  const start = `${monthKey}-01`;
  const [year, month] = monthKey.split('-').map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('expenses')
    .select(SELECT_COLUMNS)
    .gte('created_at', start)
    .lt('created_at', nextMonth)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(fromRow);
}

/**
 * Every expense, all months — feeds analytics selectors that need spend
 * across time (expenses vs revenue, etc.), same scope as the old
 * whole-tree subscription. Unscoped, so this is the more expensive of the
 * two reads; only analytics should call it.
 */
export async function fetchAllExpenses(): Promise<ExpenseRecord[]> {
  const { data, error } = await supabase.from('expenses').select(SELECT_COLUMNS).order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export interface NewExpenseInput {
  amount: number;
  category: string;
  description: string;
  loggedBy: { uid: string; name: string };
}

/**
 * Log a new expense. A plain insert, not journalled through the offline
 * queue — expenses never were (see `JournalKind` in pending-journal.ts: it
 * only ever covered `sale | payment | reversal`). A lost expense entry on a
 * force-quit is a minor inconvenience, not a financial-integrity bug the
 * way a lost sale or payment would be.
 */
export async function createExpense(input: NewExpenseInput): Promise<void> {
  const { error } = await supabase.from('expenses').insert({
    amount: input.amount,
    // `category` stays a plain string in NewExpenseInput/ExpenseRecord,
    // matching how the picker's CATEGORY_SECTIONS is typed — the DB enum is
    // what actually enforces membership (an invalid value is rejected by
    // Postgres, not silently accepted), so this cast just satisfies the
    // generated type at the call boundary rather than duplicating the enum
    // as a second source of truth in application code.
    category: input.category as ExpenseCategory,
    description: input.description,
    logged_by: input.loggedBy.uid,
    logged_by_name: input.loggedBy.name,
  });

  if (error) throw error;
}
