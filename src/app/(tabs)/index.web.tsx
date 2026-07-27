import { ThemedText } from '@/components/themed-text';
import { DashboardLayout } from '@/components/dashboard/dashboard-layout';
import { Panel } from '@/components/dashboard/panel';
import { RangeControl } from '@/components/dashboard/range-control';
import { RevenueBarChart } from '@/components/dashboard/revenue-bar-chart';
import { StatCard } from '@/components/dashboard/stat-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { StatusChip } from '@/components/ui/status-chip';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/context/settings-context';
import { useAllExpenses } from '@/hooks/use-all-expenses';
import { useRecords } from '@/hooks/use-records';
import { useTheme } from '@/hooks/use-theme';
import {
  clientsOwing,
  filterBatchesByWindow,
  filterExpensesByWindow,
  rangeToWindow,
  readyJobs,
  recentSales,
  revenueByDay,
  revenueByMonth,
  type RangePreset,
} from '@/services/analytics';
import { formatCurrency } from '@/utils/currency';
import { formatDate, parseDate } from '@/utils/date';
import { STATUS_META } from '@/utils/payment-status';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export default function DashboardWeb() {
  const theme = useTheme();
  const router = useRouter();
  const { settings } = useSettings();

  const now = new Date();
  const { sortedBatches, loading: recordsLoading } = useRecords(theme);
  const { expenses, loading: expensesLoading } = useAllExpenses();
  const loading = recordsLoading || expensesLoading;

  // Date-range control drives the KPI row + revenue trend. Needs-attention and
  // recent-sales stay current-state (they're operational, not period figures).
  const [preset, setPreset] = useState<RangePreset>('1m');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const win = useMemo(() => rangeToWindow(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const rangeLabel = win.label;

  const windowBatches = useMemo(() => filterBatchesByWindow(sortedBatches, win), [sortedBatches, win]);
  const windowExpenses = useMemo(() => filterExpensesByWindow(expenses, win), [expenses, win]);

  const metrics = useMemo(() => {
    const revenue = windowBatches.reduce((s, b) => s + (b.totalAmount || 0), 0);
    const collected = windowBatches.reduce((s, b) => s + (b.totalPaid || 0), 0);
    const outstanding = windowBatches.reduce((s, b) => s + (b.totalBalance || 0), 0);
    const spend = windowExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const net = revenue - spend;
    const margin = revenue > 0 ? (net / revenue) * 100 : 0;
    const revenueAllTime = sortedBatches.reduce((s, b) => s + (b.totalAmount || 0), 0);
    return { revenue, collected, outstanding, spend, net, margin, revenueAllTime };
  }, [windowBatches, windowExpenses, sortedBatches]);

  const trend = useMemo(() => revenueByMonth(windowBatches, win.months, win.endRef), [windowBatches, win]);
  const ready = useMemo(() => readyJobs(sortedBatches), [sortedBatches]);
  const owing = useMemo(() => clientsOwing(sortedBatches), [sortedBatches]);
  const recent = useMemo(() => recentSales(sortedBatches, 8), [sortedBatches]);

  // Live daily snapshot — always shown, independent of the range toggle.
  const today = useMemo(() => {
    const t = new Date();
    const isToday = (d: Date) =>
      d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
    let revenue = 0;
    let sales = 0;
    let jobs = 0;
    let collected = 0;
    for (const b of sortedBatches) {
      if (isToday(parseDate(b.createdAt))) {
        revenue += b.totalAmount || 0;
        sales += 1;
        jobs += b.records.length;
        collected += b.totalPaid || 0;
      }
    }
    return { revenue, sales, jobs, collected };
  }, [sortedBatches]);

  const todayDelta = useMemo(() => {
    const yesterday = revenueByDay(sortedBatches, 2)[0]?.value ?? 0;
    if (yesterday > 0) {
      const pct = Math.round(((today.revenue - yesterday) / yesterday) * 100);
      return { up: pct >= 0, text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%` };
    }
    if (today.revenue > 0) return { up: true, text: '▲ new' };
    return null;
  }, [sortedBatches, today.revenue]);

  const todayLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const todayShort = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const rightSlot = (
    <RangeControl
      value={preset}
      onChange={setPreset}
      customStart={customStart}
      customEnd={customEnd}
      onCustomStart={setCustomStart}
      onCustomEnd={setCustomEnd}
    />
  );

  return (
    <DashboardLayout
      eyebrow={todayLabel}
      title="Dashboard"
      subtitle={`Live overview of ${settings?.businessName || 'your business'} operations`}
      right={rightSlot}
    >
      {loading ? (
        <View style={{ gap: Spacing.four }}>
          <View style={styles.row}>
            {[0, 1, 2, 3].map((i) => (
              <LoadingSkeleton key={i} height={116} borderRadius={18} style={{ flex: 1, minWidth: 210 }} />
            ))}
          </View>
          <View style={styles.row}>
            <LoadingSkeleton height={280} borderRadius={20} style={{ flex: 2, minWidth: 340 }} />
            <LoadingSkeleton height={280} borderRadius={20} style={{ flex: 1, minWidth: 300 }} />
          </View>
          <LoadingSkeleton height={320} borderRadius={20} />
        </View>
      ) : (
        <>
          {/* Today band — live daily snapshot, independent of the range toggle. */}
          <View style={[styles.todayBand, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <View style={styles.todayHead}>
              <View style={[styles.todayLiveDot, { backgroundColor: STATUS_META.Paid.color }]} />
              <ThemedText type="smallBold" themeColor="onSurfaceVariant" style={styles.todayEyebrow}>Today · {todayShort}</ThemedText>
            </View>
            <View style={styles.todayCells}>
              <TodayCell label="Revenue" value={formatCurrency(today.revenue)} accent={theme.primary} delta={todayDelta} />
              <View style={[styles.todayDivider, { backgroundColor: theme.outlineVariant }]} />
              <TodayCell label="Sales" value={String(today.sales)} />
              <View style={[styles.todayDivider, { backgroundColor: theme.outlineVariant }]} />
              <TodayCell label="Jobs" value={String(today.jobs)} />
              <View style={[styles.todayDivider, { backgroundColor: theme.outlineVariant }]} />
              <TodayCell label="Collected" value={formatCurrency(today.collected)} accent={STATUS_META.Paid.color} />
            </View>
          </View>

          {/* KPI row */}
          <View style={styles.row}>
            <StatCard
              label="Revenue"
              value={formatCurrency(metrics.revenue)}
              icon={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
              accent={theme.primary}
              caption={`${rangeLabel} · ${formatCurrency(metrics.revenueAllTime)} all-time`}
            />
            <StatCard
              label="Collected"
              value={formatCurrency(metrics.collected)}
              icon={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
              accent={STATUS_META.Paid.color}
              caption={`Payments received · ${rangeLabel.toLowerCase()}`}
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(metrics.outstanding)}
              icon={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }}
              accent={STATUS_META.Unpaid.color}
              caption={owing.length > 0 ? `${owing.length} client${owing.length !== 1 ? 's' : ''} owing (all-time)` : 'All settled'}
              captionColor={owing.length > 0 ? STATUS_META.Unpaid.color : undefined}
            />
            <StatCard
              label="Net Profit"
              value={formatCurrency(metrics.net)}
              icon={{ ios: 'banknote.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' }}
              accent={metrics.net >= 0 ? STATUS_META.Paid.color : STATUS_META.Unpaid.color}
              caption={`${metrics.margin.toFixed(1)}% margin · ${formatCurrency(metrics.spend)} costs`}
            />
          </View>

          {/* Chart + needs attention */}
          <View style={styles.row}>
            <Panel
              title="Revenue trend"
              subtitle={rangeLabel}
              style={{ flex: 2, minWidth: 340 }}
              right={
                <ThemedText type="defaultSemiBold" style={{ color: theme.primary, fontVariant: ['tabular-nums'] }}>
                  {formatCurrency(metrics.revenue)}
                </ThemedText>
              }
            >
              <RevenueBarChart data={trend} />
            </Panel>

            <Panel title="Needs attention" style={{ flex: 1, minWidth: 300 }}>
              {ready.length === 0 && owing.length === 0 ? (
                <View style={styles.clearState}>
                  <SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} size={30} tintColor={STATUS_META.Paid.color} />
                  <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginTop: 8 }}>
                    Nothing needs attention. Nice.
                  </ThemedText>
                </View>
              ) : (
                <View style={{ gap: Spacing.four }}>
                  <View style={{ gap: Spacing.two }}>
                    <View style={styles.attnHead}>
                      <ThemedText type="smallBold">Ready to dispatch</ThemedText>
                      <View style={[styles.count, { backgroundColor: STATUS_META.Paid.bg }]}>
                        <ThemedText type="small" style={{ color: STATUS_META.Paid.color, fontWeight: '800' }}>{ready.length}</ThemedText>
                      </View>
                    </View>
                    {ready.slice(0, 3).map((b) => (
                      <Pressable key={b.id} onPress={() => router.push(`/transaction/${b.id}`)} style={styles.attnRow}>
                        <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{b.clientName || 'Unknown'}</ThemedText>
                        <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontVariant: ['tabular-nums'] }}>{formatCurrency(b.totalAmount)}</ThemedText>
                      </Pressable>
                    ))}
                    {ready.length === 0 ? <ThemedText type="small" themeColor="onSurfaceVariant">None</ThemedText> : null}
                  </View>

                  <View style={[styles.attnDivider, { backgroundColor: theme.outlineVariant }]} />

                  <View style={{ gap: Spacing.two }}>
                    <View style={styles.attnHead}>
                      <ThemedText type="smallBold">Clients owing</ThemedText>
                      <View style={[styles.count, { backgroundColor: STATUS_META.Unpaid.bg }]}>
                        <ThemedText type="small" style={{ color: STATUS_META.Unpaid.color, fontWeight: '800' }}>{owing.length}</ThemedText>
                      </View>
                    </View>
                    {owing.slice(0, 3).map((c) => (
                      <View key={c.clientName} style={styles.attnRow}>
                        <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{c.clientName}</ThemedText>
                        <ThemedText type="small" style={{ color: STATUS_META.Unpaid.color, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatCurrency(c.balance)}</ThemedText>
                      </View>
                    ))}
                    {owing.length === 0 ? <ThemedText type="small" themeColor="onSurfaceVariant">None</ThemedText> : null}
                  </View>
                </View>
              )}
            </Panel>
          </View>

          {/* Recent sales table */}
          <Panel
            title="Recent sales"
            subtitle="Latest transactions"
            right={
              <Pressable onPress={() => router.push('/records')}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>View all →</ThemedText>
              </Pressable>
            }
            bodyStyle={{ padding: 0 }}
          >
            <View style={[styles.tr, styles.th, { borderBottomColor: theme.outlineVariant }]}>
              <ThemedText type="small" themeColor="onSurfaceVariant" style={[styles.cell, { flex: 3 }]}>Client</ThemedText>
              <ThemedText type="small" themeColor="onSurfaceVariant" style={[styles.cell, { flex: 2 }]}>Date</ThemedText>
              <ThemedText type="small" themeColor="onSurfaceVariant" style={[styles.cell, { flex: 1, textAlign: 'center' }]}>Items</ThemedText>
              <ThemedText type="small" themeColor="onSurfaceVariant" style={[styles.cell, { flex: 2, textAlign: 'right' }]}>Amount</ThemedText>
              <ThemedText type="small" themeColor="onSurfaceVariant" style={[styles.cell, { flex: 2, textAlign: 'right' }]}>Status</ThemedText>
            </View>

            {recent.length === 0 ? (
              <View style={{ padding: Spacing.six, alignItems: 'center' }}>
                <ThemedText type="small" themeColor="onSurfaceVariant">No sales recorded yet.</ThemedText>
              </View>
            ) : (
              recent.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => router.push(`/transaction/${b.id}`)}
                  style={({ pressed }) => [styles.tr, { borderBottomColor: theme.outlineVariant }, pressed && { backgroundColor: theme.surfaceVariant }]}
                >
                  <ThemedText type="small" numberOfLines={1} style={[styles.cell, { flex: 3, fontWeight: '600' }]}>{b.clientName || 'Unknown'}</ThemedText>
                  <ThemedText type="small" themeColor="onSurfaceVariant" style={[styles.cell, { flex: 2, fontVariant: ['tabular-nums'] }]}>{formatDate(b.createdAt)}</ThemedText>
                  <ThemedText type="small" themeColor="onSurfaceVariant" style={[styles.cell, { flex: 1, textAlign: 'center' }]}>{b.records.length}</ThemedText>
                  <ThemedText type="small" style={[styles.cell, { flex: 2, textAlign: 'right', fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{formatCurrency(b.totalAmount)}</ThemedText>
                  <View style={[styles.cell, { flex: 2, alignItems: 'flex-end' }]}>
                    <StatusChip status={b.status} style={{ alignSelf: 'flex-end' }} />
                  </View>
                </Pressable>
              ))
            )}
          </Panel>
        </>
      )}
    </DashboardLayout>
  );
}

function TodayCell({ label, value, accent, delta }: { label: string; value: string; accent?: string; delta?: { up: boolean; text: string } | null }) {
  return (
    <View style={styles.todayCell}>
      <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.todayCellLabel}>{label}</ThemedText>
      <View style={styles.todayCellValRow}>
        <ThemedText style={[styles.todayCellValue, accent ? { color: accent } : null]} numberOfLines={1}>{value}</ThemedText>
        {delta ? (
          <ThemedText type="small" style={{ color: delta.up ? STATUS_META.Paid.color : STATUS_META.Unpaid.color, fontWeight: '800', fontSize: 12 }}>
            {delta.text}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  todayBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    flexWrap: 'wrap',
  },
  todayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  todayLiveDot: { width: 8, height: 8, borderRadius: 4 },
  todayEyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
  },
  todayCells: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.four,
    flexWrap: 'wrap',
    minWidth: 280,
  },
  todayCell: {
    minWidth: 84,
  },
  todayCellLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  todayCellValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  todayCellValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  todayDivider: {
    width: 1,
    height: 28,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.four,
    flexWrap: 'wrap',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  clearState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
  },
  attnHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 5,
  },
  attnDivider: { height: StyleSheet.hairlineWidth },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  th: {
    paddingVertical: Spacing.two,
  },
  cell: {
    paddingHorizontal: 6,
  },
});
