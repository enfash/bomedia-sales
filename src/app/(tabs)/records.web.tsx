import { DashboardLayout } from '@/components/dashboard/dashboard-layout';
import { Column, DataTable } from '@/components/dashboard/data-table';
import { DensityToggle } from '@/components/dashboard/density-toggle';
import { Panel } from '@/components/dashboard/panel';
import { StatCard } from '@/components/dashboard/stat-card';
import { SalesBatch } from '@/components/records/types';
import { ThemedText } from '@/components/themed-text';
import { StatusChip } from '@/components/ui/status-chip';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useRecords } from '@/hooks/use-records';
import { useTheme } from '@/hooks/use-theme';
import { logActivity } from '@/services/activity';
import type { PaymentMethod } from '@/components/records/types';
import { markBatchesPaid } from '@/services/sales-repository';
import { formatCurrency, formatCurrencyCompact } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { withAlpha } from '@/utils/color';
import { STATUS_META } from '@/utils/payment-status';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Menu, Searchbar } from 'react-native-paper';

// 'Voided' is how a voided sale stays findable — every other filter hides them.
const STATUS_FILTERS = ['All', 'Paid', 'Partial', 'Unpaid', 'Voided'];
const DATE_FILTERS = ['All Time', 'This Month', 'Last Quarter'];

function jobSummary(batch: SalesBatch): string {
  if (batch.records.length > 1) return `${batch.records.length} items`;
  const r = batch.records[0];
  if (!r) return '—';
  return `${r.material}${r.quantity ? ` · ${r.quantity} qty` : ''}`;
}

/**
 * Records — desktop data-table (Phase 2). The mobile card list (`records.tsx`)
 * is untouched; Metro serves this file on web. Sorting/filtering reuse the
 * shared `useRecords` hook; the table is the reusable `DataTable`.
 */
export default function RecordsWeb() {
  const theme = useTheme();
  const router = useRouter();
  const { isAdmin, actor } = useAuth();

  const {
    loading,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    dateFilter,
    setDateFilter,
    sortColumn,
    sortDirection,
    handleSort,
    sortedBatches,
  } = useRecords(theme, { persistKey: 'bomedia:records-filters', staffTodayOnly: !isAdmin, includeVoided: true });

  const [selected, setSelected] = useState<string[]>([]);
  const [dateMenu, setDateMenu] = useState(false);

  // KPIs reflect the *current filter*, so the numbers track what's on screen.
  const kpis = useMemo(() => {
    const revenue = sortedBatches.reduce((s, b) => s + (b.totalAmount || 0), 0);
    const collected = sortedBatches.reduce((s, b) => s + (b.totalPaid || 0), 0);
    const outstanding = sortedBatches.reduce((s, b) => s + (b.totalBalance || 0), 0);
    return { revenue, collected, outstanding, count: sortedBatches.length };
  }, [sortedBatches]);

  const toggleSelect = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const toggleSelectAll = (ids: string[], allSelected: boolean) =>
    setSelected(allSelected ? [] : ids);

  const exportCSV = () => {
    const rows = selected.length > 0 ? sortedBatches.filter((b) => selected.includes(b.id)) : sortedBatches;
    let csv = 'Date,Client,Job Details,Amount,Balance,Status\n';
    rows.forEach((b) => {
      csv += `"${formatDate(b.createdAt)}","${b.clientName}","${jobSummary(b)}","${b.totalAmount}","${b.totalBalance}","${b.status}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bomedia_sales_export.csv';
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setSelected([]);
  };

  /**
   * Bulk "mark paid" now writes a real payment entry per sale, so the method
   * has to be captured. Defaulting it would put untraceable entries in the
   * day's reconciliation — the drawer would not match and nothing would say why.
   */
  const askMethodThenMarkPaid = (batches: SalesBatch[]) => {
    const total = batches.reduce((s, b) => s + (b.totalBalance || 0), 0);
    Alert.alert(
      'How was it paid?',
      `Recording ${formatCurrency(total)} across ${batches.length} sale${batches.length !== 1 ? 's' : ''}. This adds a payment entry to each.`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...(['Cash', 'POS', 'Transfer'] as const).map((method) => ({
          text: method,
          onPress: () => void doMarkPaid(batches, method),
        })),
      ],
    );
  };

  const markPaid = () => {
    if (selected.length === 0) return;
    askMethodThenMarkPaid(sortedBatches.filter((b) => selected.includes(b.id)));
  };

  const doMarkPaid = async (batches: SalesBatch[], method: PaymentMethod) => {
    try {
      // markBatchesPaid returns only the batches it actually wrote for —
      // anything already settled is skipped rather than given a zero entry.
      const settled = await markBatchesPaid(batches, method, actor);
      if (settled.length === 0) {
        Alert.alert('Nothing to record', 'Those sales are already fully paid.');
        return;
      }
      const paidTotal = settled.reduce((s, b) => s + (b.totalBalance || 0), 0);
      logActivity({
        type: 'payment_recorded',
        actor: actor,
        message: `${actor.name} marked ${settled.length} sale${settled.length !== 1 ? 's' : ''} paid by ${method} (${formatCurrency(paidTotal)})`,
        meta: { batchIds: settled.map((b) => b.id), amount: paidTotal },
      });
      setSelected([]);
    } catch (e: any) {
      Alert.alert('Could not mark as paid', String(e?.message ?? e));
    }
  };

  const columns: Column<SalesBatch>[] = [
    {
      key: 'date',
      header: 'Date',
      sortKey: 'Date',
      flex: 1.3,
      render: (b) => (
        <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.tnum}>
          {formatDate(b.createdAt)}
        </ThemedText>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      sortKey: 'Client',
      flex: 2,
      render: (b) => (
        <ThemedText type="small" numberOfLines={1} style={{ fontWeight: '600' }}>
          {b.clientName || 'Unknown'}
        </ThemedText>
      ),
    },
    {
      key: 'details',
      header: 'Job details',
      flex: 2.2,
      render: (b) => (
        <ThemedText type="small" themeColor="onSurfaceVariant" numberOfLines={1}>
          {jobSummary(b)}
        </ThemedText>
      ),
    },
    {
      key: 'loggedBy',
      header: 'Logged by',
      sortKey: 'LoggedBy',
      flex: 1.2,
      render: (b) => (
        // Never a default name. Attribution the data does not support is worse
        // than none — this column read "Admin" for every sale, staff included,
        // because nothing had ever written the field.
        <ThemedText type="small" themeColor="onSurfaceVariant" numberOfLines={1}>
          {b.loggedByName || '—'}
        </ThemedText>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortKey: 'Amount',
      align: 'right',
      flex: 1.4,
      render: (b) => (
        <ThemedText type="small" style={[styles.tnum, { fontWeight: '700' }]}>
          {formatCurrency(b.totalAmount)}
        </ThemedText>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      sortKey: 'Balance',
      align: 'right',
      flex: 1.4,
      render: (b) => (
        <ThemedText
          type="small"
          style={[styles.tnum, { fontWeight: '700', color: b.totalBalance > 0 ? STATUS_META.Unpaid.color : theme.onSurfaceVariant }]}
        >
          {formatCurrency(b.totalBalance)}
        </ThemedText>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'Status',
      align: 'right',
      flex: 1.5,
      render: (b) => <StatusChip status={b.status} />,
    },
  ];

  const selectionActive = selected.length > 0;

  return (
    <DashboardLayout
      eyebrow="Sales"
      title="Records"
      subtitle="Manage sales, track balances, and log payments."
    >
      {/* KPI row — tracks the active filter */}
      <View style={styles.kpiRow}>
        <StatCard
          label="Revenue"
          value={formatCurrencyCompact(kpis.revenue)}
          icon={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
          accent={theme.primary}
          caption={`${kpis.count} record${kpis.count !== 1 ? 's' : ''}`}
        />
        <StatCard
          label="Collected"
          value={formatCurrencyCompact(kpis.collected)}
          icon={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
          accent={STATUS_META.Paid.color}
          caption="Payments received"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrencyCompact(kpis.outstanding)}
          icon={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }}
          accent={STATUS_META.Unpaid.color}
          caption={kpis.outstanding > 0 ? 'Awaiting collection' : 'All settled'}
          captionColor={kpis.outstanding > 0 ? STATUS_META.Unpaid.color : undefined}
        />
      </View>

      <Panel
        title="All records"
        subtitle={`${sortedBatches.length} transaction${sortedBatches.length !== 1 ? 's' : ''}${statusFilter !== 'All' ? ` · ${statusFilter}` : ''}`}
        bodyStyle={{ padding: 0 }}
      >
        {/* Toolbar */}
        <View style={[styles.toolbar, { borderBottomColor: theme.outlineVariant }]}>
          <Searchbar
            mode="bar"
            placeholder="Search client or material"
            value={searchQuery}
            onChangeText={setSearchQuery}
            elevation={0}
            style={[styles.search, { backgroundColor: withAlpha(theme.surfaceVariant, 0.4) }]}
            inputStyle={{ minHeight: 0, fontSize: 14 }}
          />

          {/* Status segmented pills */}
          <View style={[styles.segment, { borderColor: theme.outlineVariant }]}>
            {STATUS_FILTERS.map((s) => {
              const active = statusFilter === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setStatusFilter(s)}
                  style={[styles.segmentItem, active && { backgroundColor: theme.primary }]}
                >
                  <ThemedText
                    type="smallBold"
                    style={{ color: active ? theme.onPrimary : theme.onSurfaceVariant, fontSize: 12 }}
                  >
                    {s}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Date filter menu */}
          <Menu
            visible={dateMenu}
            onDismiss={() => setDateMenu(false)}
            anchor={
              <Pressable
                onPress={() => setDateMenu(true)}
                style={[styles.dateBtn, { borderColor: theme.outlineVariant }]}
              >
                <SymbolView
                  name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
                  size={14}
                  tintColor={theme.onSurfaceVariant}
                />
                <ThemedText type="smallBold" themeColor="onSurface" style={{ fontSize: 12 }}>
                  {dateFilter}
                </ThemedText>
                <SymbolView
                  name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                  size={14}
                  tintColor={theme.onSurfaceVariant}
                />
              </Pressable>
            }
          >
            {DATE_FILTERS.map((d) => (
              <Menu.Item
                key={d}
                title={d}
                onPress={() => {
                  setDateFilter(d);
                  setDateMenu(false);
                }}
                titleStyle={{ color: dateFilter === d ? theme.primary : theme.onSurface, fontWeight: dateFilter === d ? '700' : '400' }}
              />
            ))}
          </Menu>

          <View style={{ flex: 1 }} />

          {/* Actions */}
          <DensityToggle />
          {selectionActive ? (
            <>
              <ToolbarButton
                label={`Invoice (${selected.length})`}
                icon={{ ios: 'doc.text', android: 'description', web: 'description' }}
                primary
                onPress={() => {
                  router.push({ pathname: '/invoice', params: { batchId: selected.join(',') } });
                  setSelected([]);
                }}
              />
              <ToolbarButton
                label="Mark paid"
                icon={{ ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' }}
                onPress={markPaid}
              />
            </>
          ) : null}
          {isAdmin ? (
            <ToolbarButton
              label={selectionActive ? `Export (${selected.length})` : 'Export CSV'}
              icon={{ ios: 'square.and.arrow.down', android: 'download', web: 'download' }}
              onPress={exportCSV}
            />
          ) : null}
        </View>

        <DataTable<SalesBatch>
          columns={columns}
          rows={sortedBatches}
          getRowId={(b) => b.id}
          loading={loading}
          emptyText={searchQuery || statusFilter !== 'All' || dateFilter !== 'All Time' ? 'No records match these filters.' : 'No sales recorded yet.'}
          onRowPress={(b) => router.push(`/transaction/${b.id}`)}
          sortKey={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          selectable
          selectedIds={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          pageSize={12}
        />
      </Panel>
    </DashboardLayout>
  );
}

function ToolbarButton({
  label,
  icon,
  onPress,
  primary,
}: {
  label: string;
  icon: { ios: string; android: string; web: string };
  onPress: () => void;
  primary?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolBtn,
        primary
          ? { backgroundColor: theme.primary }
          : { borderWidth: 1, borderColor: theme.outlineVariant },
        pressed && { opacity: 0.75 },
      ]}
    >
      <SymbolView name={icon as any} size={15} tintColor={primary ? theme.onPrimary : theme.onSurfaceVariant} />
      <ThemedText type="smallBold" style={{ color: primary ? theme.onPrimary : theme.onSurface, fontSize: 12 }}>
        {label}
      </ThemedText>
    </Pressable>
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
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  segmentItem: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 9,
    borderRadius: 10,
  },
});
