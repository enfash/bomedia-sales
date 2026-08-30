import { fetchExpensesForMonth, type ExpenseRecord } from '@/services/expense-repository';
import { useCallback, useEffect, useState } from 'react';

export type { ExpenseRecord };

/**
 * One month's expenses. Fetched once per `selectedMonth` — not realtime
 * (out of scope for this port; see supabase/README.md). `refresh` re-runs
 * the fetch for real now, typically wired to pull-to-refresh.
 */
export function useExpenses(selectedMonth: string) {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const records = await fetchExpensesForMonth(selectedMonth);
      setExpenses(records);
    } catch (err) {
      console.warn('useExpenses: fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { expenses, loading, refresh: load };
}
