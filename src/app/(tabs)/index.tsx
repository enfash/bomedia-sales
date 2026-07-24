import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { SymbolView } from 'expo-symbols';

import { Surface } from 'react-native-paper';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KPICard } from '@/components/ui/kpi-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { PageContainer } from '@/components/ui/page-container';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useExpenses } from '@/hooks/use-expenses';
import { useRecords } from '@/hooks/use-records';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/utils/color';
import { formatCurrency } from '@/utils/currency';
import { parseDate } from '@/utils/date';
import { STATUS_META } from '@/utils/payment-status';

export default function DashboardScreen() {
  const theme = useTheme();

  const d = new Date();
  const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const { expenses, loading: expensesLoading } = useExpenses(currentMonth);
  const { sortedBatches, loading: recordsLoading } = useRecords(theme);

  const loading = recordsLoading || expensesLoading;

  const metrics = useMemo(() => {
    let todaySales = 0;
    let todayJobs = 0;
    let todayRevenue = 0;
    let mtdRevenue = 0;
    
    let allTimeBalance = 0;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();
    const currentMonthNum = new Date().getMonth();

    sortedBatches.forEach(batch => {
      const batchDate = parseDate(batch.createdAt);
      const isToday = batchDate.toISOString().split('T')[0] === todayStr;
      const isThisMonth = batchDate.getFullYear() === currentYear && batchDate.getMonth() === currentMonthNum;

      if (isToday) {
        todaySales++;
        todayJobs += batch.records.length;
        todayRevenue += batch.totalAmount;
      }

      if (isThisMonth) {
        mtdRevenue += batch.totalAmount;
      }

      allTimeBalance += batch.totalBalance;
    });

    const mtdExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const mtdNetProfit = mtdRevenue - mtdExpenses;
    const mtdGrossMargin = mtdRevenue > 0 ? (mtdNetProfit / mtdRevenue) * 100 : 0;

    return {
      todaySales,
      todayJobs,
      todayRevenue,
      mtdRevenue,
      mtdExpenses,
      mtdNetProfit,
      allTimeBalance,
      mtdGrossMargin,
    };
  }, [sortedBatches, expenses]);

  if (loading) {
    return (
      <PageContainer>
        <ThemedView style={{ padding: 40, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' }}>
          <LoadingSkeleton height={120} style={{ borderRadius: 16, marginBottom: 20 }} />
          <LoadingSkeleton height={180} style={{ borderRadius: 16, marginBottom: 20 }} />
          <View style={styles.gridContainer}>
            <LoadingSkeleton height={120} style={{ borderRadius: 16, width: '47%' }} />
            <LoadingSkeleton height={120} style={{ borderRadius: 16, width: '47%' }} />
            <LoadingSkeleton height={120} style={{ borderRadius: 16, width: '47%' }} />
            <LoadingSkeleton height={120} style={{ borderRadius: 16, width: '47%' }} />
          </View>
        </ThemedView>
      </PageContainer>
    );
  }

  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <PageContainer>
        {/* Top Header */}
        <ThemedView style={styles.header}>
          <ThemedText type="smallBold" themeColor="onSurfaceVariant" style={styles.dateText}>
            {todayDate}
          </ThemedText>
          <View style={styles.titleRow}>
            <ThemedText type="subtitle" style={styles.title}>Today at a glance</ThemedText>
            <View style={[styles.liveBadge, { backgroundColor: withAlpha(theme.error, 0.1) }]}>
              <View style={[styles.liveDot, { backgroundColor: theme.error }]} />
              <ThemedText type="smallBold" style={[styles.liveText, { color: theme.error }]}>Live</ThemedText>
            </View>
          </View>
        </ThemedView>

        {/* Live Overview Row */}
        <Surface style={styles.liveRowCard} elevation={1}>
          <View style={styles.liveItem}>
            <ThemedText type="small" themeColor="onSurfaceVariant">Sales</ThemedText>
            <ThemedText type="defaultSemiBold">{metrics.todaySales}</ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.surfaceVariant }]} />
          <View style={styles.liveItem}>
            <ThemedText type="small" themeColor="onSurfaceVariant">Jobs</ThemedText>
            <ThemedText type="defaultSemiBold">{metrics.todayJobs}</ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.surfaceVariant }]} />
          <View style={styles.liveItem}>
            <ThemedText type="small" themeColor="onSurfaceVariant">Revenue</ThemedText>
            <ThemedText type="defaultSemiBold" style={{ color: theme.primary }}>{formatCurrency(metrics.todayRevenue)}</ThemedText>
          </View>
        </Surface>

        {/* Big Card: Total Sales */}
        <Surface style={styles.bigCard} elevation={1}>
          <View style={styles.bigCardHeader}>
            <View style={[styles.iconContainer, { backgroundColor: theme.primary + '1A' }]}>
              <SymbolView name={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }} size={24} tintColor={theme.primary} />
            </View>
            <ThemedText type="defaultSemiBold" themeColor="onSurfaceVariant">Total Sales (MTD)</ThemedText>
          </View>
          <View style={styles.bigCardBody}>
            <ThemedText type="subtitle" style={styles.bigCardAmount}>{formatCurrency(metrics.mtdRevenue)}</ThemedText>
          </View>
        </Surface>

        {/* Small Cards Grid */}
        <View style={styles.gridContainer}>
          <KPICard
            title="Expenses (MTD)"
            value={formatCurrency(metrics.mtdExpenses)}
            iconName={{ ios: 'arrow.down.right.circle.fill', android: 'trending_down', web: 'trending_down' }}
            iconColor={theme.error}
            iconBackgroundColor={withAlpha(theme.error, 0.1)}
            style={styles.smallCard}
          />
          <KPICard
            title="Net Profit (MTD)"
            value={formatCurrency(metrics.mtdNetProfit)}
            iconName={{ ios: 'banknote.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' }}
            iconColor={STATUS_META.Paid.color}
            iconBackgroundColor={STATUS_META.Paid.color + '1A'}
            style={styles.smallCard}
          />
          <KPICard
            title="Outstanding Debt"
            value={formatCurrency(metrics.allTimeBalance)}
            iconName={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }}
            iconColor={theme.error}
            iconBackgroundColor={withAlpha(theme.error, 0.1)}
            style={styles.smallCard}
          />
          <KPICard
            title="Gross Margin"
            value={`${metrics.mtdGrossMargin.toFixed(1)}%`}
            iconName={{ ios: 'percent', android: 'pie_chart', web: 'pie_chart' }}
            iconColor={theme.primaryContainer}
            iconBackgroundColor={theme.primaryContainer + '1A'}
            style={styles.smallCard}
          />
        </View>

      </PageContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
    paddingHorizontal: Platform.OS === 'web' ? 0 : Spacing.four,
    paddingTop: Spacing.four,
  },
  dateText: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontWeight: '700',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 10,
    textTransform: 'uppercase',
  },
  liveRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    marginHorizontal: Platform.OS === 'web' ? 0 : Spacing.four,
    marginBottom: Spacing.four,
  },
  liveItem: {
    alignItems: 'center',
    gap: 4,
  },
  divider: {
    width: 1,
    height: '80%',
  },
  bigCard: {
    borderRadius: 16,
    padding: Spacing.four,
    marginHorizontal: Platform.OS === 'web' ? 0 : Spacing.four,
    marginBottom: Spacing.four,
  },
  bigCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigCardBody: {
    gap: Spacing.one,
  },
  bigCardAmount: {
    fontSize: 32,
    fontWeight: '700',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Platform.OS === 'web' ? 0 : Spacing.four,
  },
  smallCard: {
    width: '47%',
  },
  smallIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  smallCardInfo: {
    gap: 2,
  },
  smallCardValue: {
    fontSize: 18,
  },
});
