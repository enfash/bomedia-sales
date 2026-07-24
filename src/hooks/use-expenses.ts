import { dbService } from '@/services/db';
import { useEffect, useState } from 'react';

export interface ExpenseRecord {
  id: string;
  amount: number;
  category: string;
  description: string;
  loggedBy: string;
  createdAt: string;
  dbPath?: string;
}

export function useExpenses(selectedMonth: string) {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = dbService.subscribe(`expenses/${selectedMonth}`, (data: any) => {
      // Loading is set to false in the callback below
      if (data) {
        const recordsArray = Object.keys(data).map(key => ({
          ...data[key],
          id: key,
          dbPath: `expenses/${selectedMonth}/${key}`
        }));
        
        // Sort descending by date
        recordsArray.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setExpenses(recordsArray);
      } else {
        setExpenses([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedMonth]);

  return { expenses, loading };
}
