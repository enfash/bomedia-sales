import { fetchAllExpenses, type ExpenseRecord } from '@/services/expense-repository';
import { useEffect, useState } from 'react';

/**
 * Every expense, all months — feeds analytics selectors that need spend
 * across time (e.g. expenses vs revenue). Where {@link useExpenses} scopes
 * to a single month for the Expenses screen, this doesn't scope at all.
 *
 * Fetched once on mount, not realtime (out of scope for this port).
 */
export function useAllExpenses() {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const records = await fetchAllExpenses();
        if (!cancelled) setExpenses(records);
      } catch (err) {
        console.warn('useAllExpenses: fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { expenses, loading };
}
