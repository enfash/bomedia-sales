import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { dbService } from '@/services/db';
import { isOverdue } from '@/utils/date';
import { getPaymentStatus } from '@/utils/payment-status';
import { SalesRecord, SalesBatch } from '@/components/records/types';

export function useRecords(theme: any) {
  const [searchQuery, setSearchQuery] = useState('');
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [rawBatches, setRawBatches] = useState<SalesBatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Sort State
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All Time');
  const [sortColumn, setSortColumn] = useState('Date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [loggedByFilter, setLoggedByFilter] = useState('All');

  useEffect(() => {
    const unsubscribe = dbService.subscribe('sales', (data: any) => {
      if (data) {
        let legacyRecords: any[] = [];
        let parsedBatches: SalesBatch[] = [];

        Object.keys(data).forEach(key => {
          const value = data[key];
          
          if (key.match(/^\d{4}-\d{2}$/) && typeof value === 'object') {
            Object.keys(value).forEach(batchId => {
              const b = value[batchId];
              const batchDbPath = `sales/${key}/${batchId}`;
              const items = b.items ? Object.keys(b.items).map(iKey => ({
                ...b.items[iKey], 
                id: iKey,
                dbPath: `${batchDbPath}/items/${iKey}`
              })) : [];
              
              parsedBatches.push({
                id: batchId,
                dbPath: batchDbPath,
                clientName: b.clientName,
                createdAt: b.createdAt,
                records: items,
                totalAmount: b.totalAmount || 0,
                totalPaid: b.totalPaid || 0,
                totalBalance: (b.totalAmount || 0) - (b.totalPaid || 0),
                status: b.status || 'Pending',
                statusColor: theme.textSecondary,
                dueDate: b.dueDate,
                notes: b.notes,
              });
            });
          } else {
            legacyRecords.push({ ...value, id: key, dbPath: `sales/${key}` });
          }
        });

        const batchMap: Record<string, SalesBatch> = {};
        legacyRecords.forEach((record) => {
          const bId = record.batchId || record.id;
          if (!batchMap[bId]) {
            batchMap[bId] = {
              id: bId,
              dbPath: record.dbPath, // Just use the first record's path as fallback
              clientName: record.clientName,
              createdAt: record.createdAt,
              records: [],
              totalAmount: 0,
              totalPaid: 0,
              totalBalance: 0,
              status: "Unpaid",
              statusColor: theme.textSecondary,
              dueDate: record.dueDate,
              notes: record.notes,
            };
            parsedBatches.push(batchMap[bId]);
          }
          batchMap[bId].records.push(record);
          batchMap[bId].totalAmount += (record.total || 0);
          batchMap[bId].totalPaid += (record.amountPaid || 0);
          batchMap[bId].totalBalance = batchMap[bId].totalAmount - batchMap[bId].totalPaid;
        });

        parsedBatches.forEach(batch => {
          const overdue = isOverdue(batch.createdAt);
          const paymentStatus = getPaymentStatus(batch.totalAmount || 0, batch.totalPaid || 0, overdue);
          batch.status = paymentStatus.status;
          batch.statusColor = paymentStatus.color;
        });

        const allFlatRecords: any[] = [];
        parsedBatches.forEach(b => {
           b.records.forEach(r => allFlatRecords.push({...r, clientName: b.clientName, createdAt: b.createdAt}));
        });
        
        allFlatRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRecords(allFlatRecords as SalesRecord[]);
        setRawBatches(parsedBatches);
      } else {
        setRecords([]);
        setRawBatches([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [theme]);

  const totalRevenue = useMemo(() => rawBatches.reduce((sum, b) => sum + (b.totalAmount || 0), 0), [rawBatches]);
  const totalPaid = useMemo(() => rawBatches.reduce((sum, b) => sum + (b.totalPaid || 0), 0), [rawBatches]);
  const targetRevenue = 1000000;
  const revenuePercent = Math.min((totalRevenue / targetRevenue) * 100, 100);

  const sortedBatches = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    
    // Filter batches by search query
    const searchedBatches = rawBatches.filter(batch => {
      const matchClient = (batch.clientName || '').toLowerCase().includes(searchLower);
      const matchItem = batch.records.some(r => 
        (r.material || '').toLowerCase().includes(searchLower)
      );
      return matchClient || matchItem;
    });

    const fullyFilteredBatches = searchedBatches.filter(batch => {
      if (statusFilter !== 'All') {
        if (statusFilter === 'Unpaid' && (batch.status === 'Unpaid' || batch.status === 'Overdue')) {
          // allow
        } else if (batch.status !== statusFilter) {
          return false;
        }
      }
      
      if (loggedByFilter !== 'All') {
        const batchLoggedBy = batch.records[0]?.loggedBy || "Admin";
        if (batchLoggedBy !== loggedByFilter) return false;
      }
      
      if (dateFilter !== 'All Time') {
        const batchDate = new Date(batch.createdAt);
        const now = new Date();
        if (dateFilter === 'This Month') {
          if (batchDate.getMonth() !== now.getMonth() || batchDate.getFullYear() !== now.getFullYear()) return false;
        } else if (dateFilter === 'Last Quarter') {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(now.getMonth() - 3);
          if (batchDate < threeMonthsAgo) return false;
        }
      }
      return true;
    });

    return fullyFilteredBatches.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;
      
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
        valA = a.records[0]?.loggedBy || "Admin";
        valB = b.records[0]?.loggedBy || "Admin";
      }

      if (valA === valB) return 0;

      if (sortDirection === 'asc') {
        return valA > valB ? 1 : -1;
      } else {
        return valA < valB ? 1 : -1;
      }
    });
  }, [rawBatches, searchQuery, statusFilter, loggedByFilter, dateFilter, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
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
