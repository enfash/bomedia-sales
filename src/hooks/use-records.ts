import { SalesBatch, SalesRecord } from '@/components/records/types';
import { useSettings } from '@/context/settings-context';
import { subscribeToBatches } from '@/services/sales-repository';
import { isToday } from '@/utils/date';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SortColumn = 'Date' | 'Amount' | 'Balance' | 'Client' | 'Status' | 'LoggedBy';

interface UseRecordsOptions {
  /**
   * Include voided sales. Default false.
   *
   * This hook is the single subscription point for eleven consumers, so
   * filtering here fixes all of them at once — auditing each one individually
   * is how one gets missed. Only three callers opt in: both Records twins (for
   * the Voided filter) and the transaction detail screen, so a voided sale can
   * still be opened and its reason read.
   */
  includeVoided?: boolean;
  /**
   * When set (web only), the status/date/sort selection is auto-remembered in
   * localStorage under this key and restored next time. Opt-in per call so the
   * Records page persists while other `useRecords` consumers (Clients, Board,
   * Dashboard, Analytics) keep their default unfiltered view.
   */
  persistKey?: string;
  /**
   * When true, only today's batches are visible. Used to scope the Records
   * screen for staff (role-based) — they don't see prior days' sales here.
   * Kept local to the Records screens: Clients / Board / Debt still aggregate
   * across all sales, so this flag is intentionally NOT set by those consumers.
   */
  staffTodayOnly?: boolean;
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
  const { persistKey, staffTodayOnly, includeVoided = false } = options;
  const { settings } = useSettings();
  const defaultTermsDays = settings?.defaultTermsDays ?? 7;
  const [persisted] = useState(() => loadPersistedFilters(persistKey));

  const [searchQuery, setSearchQuery] = useState('');
  const [rawBatches, setRawBatches] = useState<SalesBatch[]>([]);
  const [loading, setLoading] = useState(true);
  // Bumping this re-runs the subscription effect (pull-to-refresh re-pulls a
  // fresh snapshot even though the underlying listener is already realtime).
  const [refreshNonce, setRefreshNonce] = useState(0);

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

  // The single place Settings meets the repository. `normalizeBatch` stays a
  // pure function of its arguments; the live terms value is injected here.
  useEffect(() => {
    const unsubscribe = subscribeToBatches((batches) => {
      setRawBatches(batches);
      setLoading(false);
    }, defaultTermsDays, includeVoided);
    return () => unsubscribe();
  }, [refreshNonce, defaultTermsDays, includeVoided]);

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  // Role scoping: staff only see today's batches on the Records screen.
  const scopedBatches = useMemo(
    () => (staffTodayOnly ? rawBatches.filter((b) => isToday(b.createdAt)) : rawBatches),
    [rawBatches, staffTodayOnly],
  );

  // Flat, newest-first list of every line item (with batch context denormalized).
  const records = useMemo<SalesRecord[]>(() => {
    const flat: SalesRecord[] = [];
    scopedBatches.forEach((b) => {
      b.records.forEach((r) =>
        flat.push({ ...r, clientName: b.clientName, createdAt: b.createdAt, batchId: b.id }),
      );
    });
    return flat.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );
  }, [scopedBatches]);

  const totalRevenue = useMemo(
    () => scopedBatches.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
    [scopedBatches],
  );
  const totalPaid = useMemo(
    () => scopedBatches.reduce((sum, b) => sum + (b.totalPaid || 0), 0),
    [scopedBatches],
  );
  const targetRevenue = 1000000;
  const revenuePercent = Math.min((totalRevenue / targetRevenue) * 100, 100);

  const sortedBatches = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();

    const searchedBatches = scopedBatches.filter((batch) => {
      const matchClient = (batch.clientName || '').toLowerCase().includes(searchLower);
      const matchItem = batch.records.some((r) =>
        (r.material || '').toLowerCase().includes(searchLower),
      );
      return matchClient || matchItem;
    });

    const fullyFilteredBatches = searchedBatches.filter((batch) => {
      // Voided sales are hidden from every list unless explicitly asked for.
      // The subscription already excludes them for consumers that did not opt
      // in, so this is a no-op there — it is what makes the Records "Voided"
      // filter work without a second subscription.
      if (statusFilter === 'Voided') {
        if (!batch.isVoided) return false;
      } else if (batch.isVoided) {
        return false;
      }

      if (statusFilter !== 'All' && statusFilter !== 'Voided') {
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
  }, [scopedBatches, searchQuery, statusFilter, loggedByFilter, dateFilter, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column as SortColumn);
      setSortDirection('desc');
    }
  };

  return {
    /**
     * Every batch from the subscription, before any UI filter. The transaction
     * detail screen needs this: `sortedBatches` hides voided sales, but opening
     * one by id has to work so its void reason can be read.
     */
    allBatches: rawBatches,
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
    refresh,
  };
}
