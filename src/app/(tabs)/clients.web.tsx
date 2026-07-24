import { DashboardLayout } from '@/components/dashboard/dashboard-layout';
import { Column, DataTable } from '@/components/dashboard/data-table';
import { DensityToggle } from '@/components/dashboard/density-toggle';
import { Panel } from '@/components/dashboard/panel';
import { StatCard } from '@/components/dashboard/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useRecords } from '@/hooks/use-records';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { withAlpha } from '@/utils/color';
import { STATUS_META } from '@/utils/payment-status';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Searchbar } from 'react-native-paper';

interface ClientAgg {
  clientName: string;
  totalSpend: number;
  totalPaid: number;
  balance: number;
  lastPurchaseDate: number;
  jobsCount: number;
}

type SortKey = 'name' | 'jobs' | 'spend' | 'balance' | 'last';
type SortDir = 'asc' | 'desc';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Clients — desktop data-table (Phase 2). Aggregates sales batches into a
 * per-client overview (lifetime value, balance, jobs, last order). Mobile
 * `clients.tsx` (card list) is untouched; Metro serves this file on web.
 */
export default function ClientsWeb() {
  const theme = useTheme();

  const { sortedBatches: batches, loading } = useRecords(theme);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const clientsList = useMemo(() => {
    const map: Record<string, ClientAgg> = {};
    batches.forEach((batch) => {
      const name = batch.clientName?.trim() || 'Unknown Client';
      if (!map[name]) {
        map[name] = { clientName: name, totalSpend: 0, totalPaid: 0, balance: 0, lastPurchaseDate: 0, jobsCount: 0 };
      }
      map[name].totalSpend += batch.totalAmount || 0;
      map[name].totalPaid += batch.totalPaid || 0;
      map[name].jobsCount += batch.records.length;
      const t = new Date(batch.createdAt).getTime();
      if (t > map[name].lastPurchaseDate) map[name].lastPurchaseDate = t;
    });
    Object.values(map).forEach((c) => {
      c.balance = c.totalSpend - c.totalPaid;
    });
    return Object.values(map);
  }, [batches]);

  const filtered = useMemo(() => {
    if (!search) return clientsList;
    const lower = search.toLowerCase();
    return clientsList.filter((c) => c.clientName.toLowerCase().includes(lower));
  }, [clientsList, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.clientName.localeCompare(b.clientName);
      else if (sortKey === 'jobs') cmp = a.jobsCount - b.jobsCount;
      else if (sortKey === 'spend') cmp = a.totalSpend - b.totalSpend;
      else if (sortKey === 'balance') cmp = a.balance - b.balance;
      else cmp = a.lastPurchaseDate - b.lastPurchaseDate;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: string) => {
    const k = key as SortKey;
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir(k === 'name' ? 'asc' : 'desc');
    }
  };

  const kpis = useMemo(() => {
    const lifetime = filtered.reduce((s, c) => s + c.totalSpend, 0);
    const outstanding = filtered.reduce((s, c) => s + c.balance, 0);
    const owing = filtered.filter((c) => c.balance > 0).length;
    return { count: filtered.length, lifetime, outstanding, owing };
  }, [filtered]);

  const exportCSV = () => {
    let csv = 'Client,Jobs,Lifetime Value,Collected,Balance,Last Order\n';
    sorted.forEach((c) => {
      csv += `"${c.clientName}","${c.jobsCount}","${c.totalSpend}","${c.totalPaid}","${c.balance}","${c.lastPurchaseDate ? formatDate(c.lastPurchaseDate) : ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bomedia_clients_export.csv';
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const columns: Column<ClientAgg>[] = [
    {
      key: 'name',
      header: 'Client',
      sortKey: 'name',
      flex: 2.6,
      render: (c) => (
        <View style={styles.nameCell}>
          <View style={[styles.avatar, { backgroundColor: theme.primary + '1A' }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary, fontSize: 11 }}>{initials(c.clientName)}</ThemedText>
          </View>
          <ThemedText type="small" numberOfLines={1} style={{ fontWeight: '600', flex: 1 }}>{c.clientName}</ThemedText>
        </View>
      ),
    },
    {
      key: 'jobs',
      header: 'Jobs',
      sortKey: 'jobs',
      align: 'center',
      flex: 1,
      render: (c) => (
        <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.tnum}>{c.jobsCount}</ThemedText>
      ),
    },
    {
      key: 'spend',
      header: 'Lifetime value',
      sortKey: 'spend',
      align: 'right',
      flex: 1.6,
      render: (c) => (
        <ThemedText type="small" style={[styles.tnum, { fontWeight: '700' }]}>{formatCurrency(c.totalSpend)}</ThemedText>
      ),
    },
    {
      key: 'collected',
      header: 'Collected',
      align: 'right',
      flex: 1.5,
      render: (c) => (
        <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.tnum}>{formatCurrency(c.totalPaid)}</ThemedText>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      sortKey: 'balance',
      align: 'right',
      flex: 1.5,
      render: (c) => (
        <ThemedText
          type="small"
          style={[styles.tnum, { fontWeight: '700', color: c.balance > 0 ? STATUS_META.Unpaid.color : theme.onSurfaceVariant }]}
        >
          {formatCurrency(c.balance)}
        </ThemedText>
      ),
    },
    {
      key: 'last',
      header: 'Last order',
      sortKey: 'last',
      align: 'right',
      flex: 1.4,
      render: (c) => (
        <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.tnum}>
          {c.lastPurchaseDate ? formatDate(c.lastPurchaseDate) : '—'}
        </ThemedText>
      ),
    },
  ];

  return (
    <DashboardLayout
      eyebrow="Directory"
      title="Clients"
      subtitle="Client history, lifetime value, and outstanding balances."
    >
      <View style={styles.kpiRow}>
        <StatCard
          label="Clients"
          value={String(kpis.count)}
          icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
          accent={theme.primary}
          caption="With sales on record"
        />
        <StatCard
          label="Lifetime value"
          value={formatCurrency(kpis.lifetime)}
          icon={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
          accent={STATUS_META.Paid.color}
          caption="Total billed across clients"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(kpis.outstanding)}
          icon={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }}
          accent={STATUS_META.Unpaid.color}
          caption={kpis.owing > 0 ? `${kpis.owing} client${kpis.owing !== 1 ? 's' : ''} owing` : 'All settled'}
          captionColor={kpis.owing > 0 ? STATUS_META.Unpaid.color : undefined}
        />
      </View>

      <Panel
        title="All clients"
        subtitle={`${filtered.length} client${filtered.length !== 1 ? 's' : ''}`}
        bodyStyle={{ padding: 0 }}
      >
        <View style={[styles.toolbar, { borderBottomColor: theme.outlineVariant }]}>
          <Searchbar
            mode="bar"
            placeholder="Search clients"
            value={search}
            onChangeText={setSearch}
            elevation={0}
            style={[styles.search, { backgroundColor: withAlpha(theme.surfaceVariant, 0.4) }]}
            inputStyle={{ minHeight: 0, fontSize: 14 }}
          />
          <View style={{ flex: 1 }} />
          <DensityToggle />
          <Pressable
            onPress={exportCSV}
            style={({ pressed }) => [styles.toolBtn, { borderColor: theme.outlineVariant }, pressed && { opacity: 0.75 }]}
          >
            <SymbolView name={{ ios: 'square.and.arrow.down', android: 'download', web: 'download' }} size={15} tintColor={theme.onSurfaceVariant} />
            <ThemedText type="smallBold" style={{ color: theme.onSurface, fontSize: 12 }}>Export CSV</ThemedText>
          </Pressable>
        </View>

        <DataTable<ClientAgg>
          columns={columns}
          rows={sorted}
          getRowId={(c) => c.clientName}
          loading={loading}
          emptyText={search ? 'No clients match your search.' : 'No client records yet.'}
          sortKey={sortKey}
          sortDirection={sortDir}
          onSort={handleSort}
          pageSize={12}
        />
      </Panel>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    flexWrap: 'wrap',
  },
  tnum: {
    fontVariant: ['tabular-nums'],
  },
  nameCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
  },
  search: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 200,
    maxWidth: 360,
    height: 40,
    borderRadius: 10,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
});
