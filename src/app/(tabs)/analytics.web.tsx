import { BarList, type BarRow } from '@/components/dashboard/bar-list';
import { DashboardLayout } from '@/components/dashboard/dashboard-layout';
import { MonthlyComparisonChart } from '@/components/dashboard/monthly-comparison-chart';
import { Panel } from '@/components/dashboard/panel';
import { RevenueBarChart } from '@/components/dashboard/revenue-bar-chart';
import { RangeControl } from '@/components/dashboard/range-control';
import { SplitBar } from '@/components/dashboard/split-bar';
import { StatCard } from '@/components/dashboard/stat-card';
import { ThemedText } from '@/components/themed-text';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Spacing } from '@/constants/theme';
import { useAdminGate } from '@/hooks/use-admin-gate';
import { useRouter } from 'expo-router';
import { useAllExpenses } from '@/hooks/use-all-expenses';
import { useRecords } from '@/hooks/use-records';
import { useTheme } from '@/hooks/use-theme';
import {
  collectedVsOutstanding,
  expensesVsRevenue,
  filterBatchesByWindow,
  filterExpensesByWindow,
  productionThroughput,
  rangeToWindow,
  revenueByMaterial,
  revenueByMonth,
  topClients,
  type RangePreset,
} from '@/services/analytics';
import { formatCurrency, formatCurrencyCompact } from '@/utils/currency';
import { STATUS_META } from '@/utils/payment-status';
import { STAGE_META } from '@/utils/production-stage';
import { useMemo, useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

export default function AnalyticsWeb() {
  const theme = useTheme();
  const gate = useAdminGate();
  const router = useRouter();

  // Same as Daily Cash: a route this account cannot use is not a place to leave
  // it standing. Only on `denied` — redirecting while the role is `pending`
  // would bounce an admin whose users/{uid} read has not returned yet.
  useEffect(() => {
    if (gate === 'denied') router.replace('/');
  }, [gate, router]);

  const { sortedBatches: batches, loading: recordsLoading } = useRecords(theme);
  const { expenses, loading: expensesLoading } = useAllExpenses();
  const loading = recordsLoading || expensesLoading;

  // Page-level date range — one control drives every widget.
  const [preset, setPreset] = useState<RangePreset>('6m');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const win = useMemo(() => rangeToWindow(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const rangeLabel = win.label;

  const windowBatches = useMemo(() => filterBatchesByWindow(batches, win), [batches, win]);
  const windowExpenses = useMemo(() => filterExpensesByWindow(expenses, win), [expenses, win]);

  const trend = useMemo(() => revenueByMonth(windowBatches, win.months, win.endRef), [windowBatches, win]);
  const evr = useMemo(() => expensesVsRevenue(windowBatches, windowExpenses, win.months, win.endRef), [windowBatches, windowExpenses, win]);
  const split = useMemo(() => collectedVsOutstanding(windowBatches), [windowBatches]);
  const throughput = useMemo(() => productionThroughput(windowBatches), [windowBatches]);
  const materials = useMemo(() => revenueByMaterial(windowBatches, 6), [windowBatches]);
  const clients = useMemo(() => topClients(windowBatches, 6), [windowBatches]);

  const totals = useMemo(() => {
    const revenue = windowBatches.reduce((s, b) => s + (b.totalAmount || 0), 0);
    const spend = windowExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const net = revenue - spend;
    return { revenue, spend, net, margin: revenue > 0 ? (net / revenue) * 100 : 0 };
  }, [windowBatches, windowExpenses]);

  const rangeControl = (
    <RangeControl
      value={preset}
      onChange={setPreset}
      customStart={customStart}
      customEnd={customEnd}
      onCustomStart={setCustomStart}
      onCustomEnd={setCustomEnd}
    />
  );

  const throughputRows: BarRow[] = throughput.map((t) => ({
    label: t.stage,
    value: t.count,
    caption: formatCurrency(t.value),
    accent: STAGE_META[t.stage],
  }));

  const materialRows: BarRow[] = materials.map((m) => ({
    label: m.material,
    value: m.revenue,
    caption: `${m.jobs} job${m.jobs !== 1 ? 's' : ''}`,
  }));

  const clientRows: BarRow[] = clients.map((c) => ({
    label: c.clientName,
    value: c.revenue,
    caption: c.balance > 0 ? `${formatCurrency(c.balance)} owing` : undefined,
  }));

  // `pending` is the role read still in flight, not a refusal — see useAdminGate.
  if (gate !== 'allowed') {
    return (
      <DashboardLayout eyebrow="Insights" title="Analytics" subtitle="Business performance and reports.">
        {gate === 'pending' ? (
          <Panel title="Loading">
            <LoadingSkeleton width="100%" height={120} borderRadius={16} />
          </Panel>
        ) : (
          <Panel title="Admins only">
            <ThemedText type="small" themeColor="onSurfaceVariant">
              Analytics — revenue, margins and reports — is available to admins only.
            </ThemedText>
          </Panel>
        )}
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      eyebrow="Insights"
      title="Analytics"
      subtitle="Revenue, spend and production performance across your business."
      right={loading ? undefined : rangeControl}
    >
      {loading ? (
        <View style={{ gap: Spacing.four }}>
          <View style={styles.row}>
            {[0, 1, 2, 3].map((i) => (
              <LoadingSkeleton key={i} height={116} borderRadius={18} style={{ flex: 1, minWidth: 210 }} />
            ))}
          </View>
          <View style={styles.row}>
            <LoadingSkeleton height={300} borderRadius={20} style={{ flex: 2, minWidth: 340 }} />
            <LoadingSkeleton height={300} borderRadius={20} style={{ flex: 1, minWidth: 300 }} />
          </View>
          <LoadingSkeleton height={300} borderRadius={20} />
        </View>
      ) : (
        <>
          {/* KPI row */}
          <View style={styles.row}>
            <StatCard
              label="Revenue"
              value={formatCurrencyCompact(totals.revenue)}
              icon={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
              accent={theme.primary}
              caption={rangeLabel}
            />
            <StatCard
              label="Expenses"
              value={formatCurrencyCompact(totals.spend)}
              icon={{ ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' }}
              accent={STATUS_META.Partial.color}
              caption={rangeLabel}
            />
            <StatCard
              label="Net Profit"
              value={formatCurrencyCompact(totals.net)}
              icon={{ ios: 'banknote.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' }}
              accent={totals.net >= 0 ? STATUS_META.Paid.color : STATUS_META.Unpaid.color}
              caption={`${totals.margin.toFixed(1)}% margin`}
              captionColor={totals.net >= 0 ? STATUS_META.Paid.color : STATUS_META.Unpaid.color}
            />
            <StatCard
              label="Collected"
              value={`${split.collectedPct.toFixed(0)}%`}
              icon={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
              accent={STATUS_META.Paid.color}
              caption={`${formatCurrency(split.outstanding)} outstanding`}
              captionColor={split.outstanding > 0 ? STATUS_META.Unpaid.color : undefined}
            />
          </View>

          {/* Revenue trend + collected split */}
          <View style={styles.row}>
            <Panel title="Revenue trend" subtitle={rangeLabel} style={{ flex: 2, minWidth: 340 }}>
              <RevenueBarChart data={trend} />
            </Panel>
            <Panel title="Collected vs outstanding" subtitle={rangeLabel} style={{ flex: 1, minWidth: 300 }}>
              <SplitBar split={split} />
            </Panel>
          </View>

          {/* Expenses vs revenue + throughput */}
          <View style={styles.row}>
            <Panel title="Revenue vs expenses" subtitle={rangeLabel} style={{ flex: 2, minWidth: 340 }}>
              <MonthlyComparisonChart data={evr} />
            </Panel>
            <Panel title="Production throughput" subtitle="Jobs by stage" style={{ flex: 1, minWidth: 300 }}>
              <BarList data={throughputRows} formatValue={(n) => `${n} job${n !== 1 ? 's' : ''}`} emptyText="No jobs in production" />
            </Panel>
          </View>

          {/* Revenue by material + top clients */}
          <View style={styles.row}>
            <Panel title="Revenue by material" subtitle="Top materials" style={{ flex: 1, minWidth: 320 }}>
              <BarList data={materialRows} formatValue={formatCurrency} accent={theme.primary} emptyText="No sales recorded yet" />
            </Panel>
            <Panel title="Top clients" subtitle="By lifetime revenue" style={{ flex: 1, minWidth: 320 }}>
              <BarList data={clientRows} formatValue={formatCurrency} accent={theme.primary} emptyText="No clients yet" />
            </Panel>
          </View>
        </>
      )}
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.four,
    flexWrap: 'wrap',
  },
});
