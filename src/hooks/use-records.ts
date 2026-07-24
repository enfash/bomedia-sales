import { SalesBatch, SalesRecord } from '@/components/records/types';
import { subscribeToBatches } from '@/services/sales-repository';
import { useEffect, useMemo, useState } from 'react';

type SortColumn = 'Date' | 'Amount' | 'Balance' | 'Client' | 'Status' | 'LoggedBy';

interface UseRecordsOptions {
  /**
   * When set (web only), the status/date/sort selection is auto-remembered in
   * localStorage under this key and restored next time. Opt-in per call so the
   * Records page persists while other `useRecords` consumers (Clients, Board,
   * Dashboard, Analytics) keep their default unfiltered view.
   */
  persistKey?: string;
}

interface PersistedFilters {
  statusFilter?: string;
  dateFilter?: string;
  sortColumn?: SortColumn;
  sortDirection?: 'asc' | 'desc';
}

function loadPersistedFilters(key?: string): PersistedFilters | null {
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as PersistedFilters) : null;
  } catch {
    return null;
  }
}

export function useRecords(_theme?: unknown, options: UseRecordsOptions = {}) {
  const { persistKey } = options;
  const [persisted] = useState(() => loadPersistedFilters(persistKey));

  const [searchQuery, setSearchQuery] = useState('');
  const [rawBatches, setRawBatches] = useState<SalesBatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Sort State (status/date/sort auto-remembered when persistKey is set;
  // search stays transient so a stale query never hides records on return).
  const [statusFilter, setStatusFilter] = useState(persisted?.statusFilter ?? 'All');
  const [dateFilter, setDateFilter] = useState(persisted?.dateFilter ?? 'All Time');
  const [sortColumn, setSortColumn] = useState<SortColumn>(persisted?.sortColumn ?? 'Date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(persisted?.sortDirection ?? 'desc');
  const [loggedByFilter, setLoggedByFilter] = useState('All');

  // Write the current selection back so Records restores it (web only).
  useEffect(() => {
    if (!persistKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(persistKey, JSON.stringify({ statusFilter, dateFilter, sortColumn, sortDirection }));
    } catch {
      // ignore quota / serialization errors
    }
  }, [persistKey, statusFilter, dateFilter, sortColumn, sortDirection]);

  useEffect(() => {
    const unsubscribe = subscribeToBatches((batches) => {
      setRawBatches(batches);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Flat, newest-first list of every line item (with batch context denormalized).
  const records = useMemo<SalesRecord[]>(() => {
    const flat: SalesRecord[] = [];
    rawBatches.forEach((b) => {
      b.records.forEach((r) =>
        flat.push({ ...r, clientName: b.clientName, createdAt: b.createdAt, batchId: b.id }),
      );
    });
    return flat.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );
  }, [rawBatches]);

  const totalRevenue = useMemo(
    () => rawBatches.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
    [rawBatches],
  );
  const totalPaid = useMemo(
    () => rawBatches.reduce((sum, b) => sum + (b.totalPaid || 0), 0),
    [rawBatches],
  );
  const targetRevenue = 1000000;
  const revenuePercent = Math.min((totalRevenue / targetRevenue) * 100, 100);

  const sortedBatches = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();

    const searchedBatches = rawBatches.filter((batch) => {
      const matchClient = (batch.clientName || '').toLowerCase().includes(searchLower);
      const matchItem = batch.records.some((r) =>
        (r.material || '').toLowerCase().includes(searchLower),
      );
      return matchClient || matchItem;
    });

    const fullyFilteredBatches = searchedBatches.filter((batch) => {
      if (statusFilter !== 'All') {
        if (statusFilter === 'Unpaid' && (batch.status === 'Unpaid' || batch.status === 'Overdue')) {
          // allow
        } else if (batch.status !== statusFilter) {
          return false;
        }
      }

      if (loggedByFilter !== 'All') {
        const batchLoggedBy = batch.records[0]?.loggedBy || 'Admin';
        if (batchLoggedBy !== loggedByFilter) return false;
      }

      if (dateFilter !== 'All Time') {
        const batchDate = new Date(batch.createdAt);
        const now = new Date();
        if (dateFilter === 'This Month') {
          if (batchDate.getMonth() !== now.getMonth() || batchDate.getFullYear() !== now.getFullYear())
            return false;
        } else if (dateFilter === 'Last Quarter') {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(now.getMonth() - 3);
          if (batchDate < threeMonthsAgo) return false;
        }
      }
      return true;
    });

    return [...fullyFilteredBatches].sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      if (sortColumn === 'Date') {
        valA = new Date(a.createdAt).getTime();
        valB = new Date(b.createdAt).getTime();
      } else if (sortColumn === 'Amount') {
        valA = a.totalAmount;
        valB = b.totalAmount;
      } else if (sortColumn === 'Balance') {
        valA = a.totalBalance;
        valB = b.totalBalance;
      } else if (sortColumn === 'Client') {
        valA = (a.clientName || '').toLowerCase();
        valB = (b.clientName || '').toLowerCase();
      } else if (sortColumn === 'Status') {
        valA = a.status;
        valB = b.status;
      } else if (sortColumn === 'LoggedBy') {
        valA = a.records[0]?.loggedBy || 'Admin';
        valB = b.records[0]?.loggedBy || 'Admin';
      }

      if (valA === valB) return 0;
      if (sortDirection === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });
  }, [rawBatches, searchQuery, statusFilter, loggedByFilter, dateFilter, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column as SortColumn);
      setSortDirection('desc');
    }
  };

  return {
    records,
    loading,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    dateFilter,
    setDateFilter,
    sortColumn,
    sortDirection,
    loggedByFilter,
    setLoggedByFilter,
    handleSort,
    sortedBatches,
    totalRevenue,
    totalPaid,
    revenuePercent,
  };
}
