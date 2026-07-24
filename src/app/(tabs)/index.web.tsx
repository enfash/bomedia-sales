import { ThemedText } from '@/components/themed-text';
import { DashboardLayout } from '@/components/dashboard/dashboard-layout';
import { Panel } from '@/components/dashboard/panel';
import { RevenueBarChart } from '@/components/dashboard/revenue-bar-chart';
import { StatCard } from '@/components/dashboard/stat-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { StatusChip } from '@/components/ui/status-chip';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/context/settings-context';
import { useExpenses } from '@/hooks/use-expenses';
import { useRecords } from '@/hooks/use-records';
import { useTheme } from '@/hooks/use-theme';
import {
  clientsOwing,
  computeDashboardMetrics,
  readyJobs,
  recentSales,
  revenueByMonth,
} from '@/services/analytics';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { STATUS_META } from '@/utils/payment-status';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export default function DashboardWeb() {
  const theme = useTheme();
  const router = useRouter();
  const { settings } = useSettings();

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { sortedBatches, loading: recordsLoading } = useRecords(theme);
  const { expenses, loading: expensesLoading } = useExpenses(currentMonth);
  const loading = recordsLoading || expensesLoading;

  const metrics = useMemo(() => computeDashboardMetrics(sortedBatches, expenses), [sortedBatches, expenses]);
  const trend = useMemo(() => revenueByMonth(sortedBatches, 6), [sortedBatches]);
  const ready = useMemo(() => readyJobs(sortedBatches), [sortedBatches]);
  const owing = useMemo(() => clientsOwing(sortedBatches), [sortedBatches]);
  const recent = useMemo(() => recentSales(sortedBatches, 8), [sortedBatches]);

  const todayLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const rightSlot = (
    <View style={[styles.livePill, { backgroundColor: STATUS_META.Paid.bg }]}>
      <View style={[styles.liveDot, { backgroundColor: STATUS_META.Paid.color }]} />
      <ThemedText type="smallBold" style={{ color: STATUS_META.Paid.color, fontSize: 11 }}>LIVE</ThemedText>
    </View>
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
          {/* KPI row */}
          <View style={styles.row}>
            <StatCard
              label="Revenue (MTD)"
              value={formatCurrency(metrics.mtdRevenue)}
              icon={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
              accent={theme.primary}
              caption={`${formatCurrency(metrics.revenueAllTime)} all-time`}
            />
            <StatCard
              label="Collected"
              value={formatCurrency(metrics.collectedAllTime)}
              icon={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
              accent={STATUS_META.Paid.color}
              caption="Payments received to date"
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(metrics.outstanding)}
              icon={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }}
              accent={STATUS_META.Unpaid.color}
              caption={owing.length > 0 ? `${owing.length} client${owing.length !== 1 ? 's' : ''} owing` : 'All settled'}
              captionColor={owing.length > 0 ? STATUS_META.Unpaid.color : undefined}
            />
            <StatCard
              label="Net Profit (MTD)"
              value={formatCurrency(metrics.mtdNetProfit)}
              icon={{ ios: 'banknote.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' }}
              accent={metrics.mtdNetProfit >= 0 ? STATUS_META.Paid.color : STATUS_META.Unpaid.color}
              caption={`${metrics.grossMargin.toFixed(1)}% margin · ${formatCurrency(metrics.mtdExpenses)} costs`}
            />
          </View>

          {/* Chart + needs attention */}
          <View style={styles.row}>
            <Panel
              title="Revenue trend"
              subtitle="Last 6 months"
              style={{ flex: 2, minWidth: 340 }}
              right={
                <ThemedText type="defaultSemiBold" style={{ color: theme.primary, fontVariant: ['tabular-nums'] }}>
                  {formatCurrency(metrics.mtdRevenue)}
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
                    <StatusChip status={b.status} />
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

const styles = StyleSheet.create({
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
