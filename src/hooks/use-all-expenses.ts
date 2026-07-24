import { dbService } from '@/services/db';
import { useEffect, useState } from 'react';
import type { ExpenseRecord } from './use-expenses';

/**
 * Subscribes to the entire `expenses` tree (all month buckets) and returns a
 * flat list of expense records. Where {@link useExpenses} scopes to a single
 * month for the Expenses screen, this feeds the analytics selectors that need
 * spend across many months (e.g. expenses vs revenue).
 */
export function useAllExpenses() {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = dbService.subscribe('expenses', (data: any) => {
      if (data && typeof data === 'object') {
        const flat: ExpenseRecord[] = [];
        Object.keys(data).forEach((month) => {
          const bucket = data[month];
          if (bucket && typeof bucket === 'object') {
            Object.keys(bucket).forEach((key) => {
              flat.push({ ...bucket[key], id: key, dbPath: `expenses/${month}/${key}` });
            });
          }
        });
        setExpenses(flat);
      } else {
        setExpenses([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { expenses, loading };
}
