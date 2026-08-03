import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePageContainerStyles } from '@/components/ui/page-container';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeWriteError } from '@/utils/errors';
import { logActivity } from '@/services/activity';
import type { PaymentMethod, SalesBatch } from '@/components/records/types';
import { markBatchesPaid } from '@/services/sales-repository';
import { formatCurrency } from '@/utils/currency';
import { useState } from 'react';
import { Alert, Platform, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Surface } from 'react-native-paper';

import { QuotaCard } from '@/components/records/quota-card';
import { RecordsHeader } from '@/components/records/records-header';
import { RecordsTable } from '@/components/records/records-table';
import { useAuth } from '@/context/auth-context';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { useRecords } from '@/hooks/use-records';
import { formatDate } from '@/utils/date';

export default function RecordsScreen() {
  const theme = useTheme();
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
    totalRevenue,
    totalPaid,
    refresh,
  } = useRecords(theme, { staffTodayOnly: !isAdmin, includeVoided: true });

  const { refreshing, onRefresh } = usePullRefresh([refresh]);

  // Additional component state
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);

  const toggleSelectBatch = (id: string) => {
    if (selectedBatches.includes(id)) {
      setSelectedBatches(selectedBatches.filter(b => b !== id));
    } else {
      setSelectedBatches([...selectedBatches, id]);
    }
  };

  const exportCSV = () => {
    let csv = "Date,Client,Job Details,Amount,Balance,Status\n";
    const batchesToExport = selectedBatches.length > 0 ? sortedBatches.filter(b => selectedBatches.includes(b.id)) : sortedBatches;
    batchesToExport.forEach(batch => {
      const date = formatDate(batch.createdAt);
      const details = batch.records.length > 1 ? `${batch.records.length} items` : `${batch.records[0]?.material} ${batch.records[0]?.quantity} qty`;
      csv += `"${date}","${batch.clientName}","${details}","${batch.totalAmount}","${batch.totalBalance}","${batch.status}"\n`;
    });
    setSelectedBatches([]);
    
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "bomedia_sales_export.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      Alert.alert('Web only', 'CSV export is currently supported on web.');
    }
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
      setSelectedBatches([]);
    } catch (e: any) {
      const message = describeWriteError(e, 'mark these paid');
      Alert.alert(message.title, message.body);
    }
  };

  const markSelectedAsPaid = () => {
    if (selectedBatches.length === 0) return;
    askMethodThenMarkPaid(sortedBatches.filter((b) => selectedBatches.includes(b.id)));
  };

  const { contentStyle } = usePageContainerStyles(false, 80);

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const headerComponent = (
    <View style={{ gap: Spacing.four, paddingTop: isMobile ? Spacing.four : 0, paddingBottom: Spacing.four, paddingHorizontal: isMobile ? Spacing.four : 0 }}>
      <ThemedView style={styles.header}>
        <ThemedText type="subtitle" style={styles.title}>Data Records</ThemedText>
        <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
          Manage sales, track balances, and log payments.
        </ThemedText>
      </ThemedView>

      <View>
        <QuotaCard
          theme={theme}
          totalRevenue={totalRevenue}
          totalPaid={totalPaid}
        />
      </View>

      <RecordsHeader
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        selectedBatches={selectedBatches}
        setSelectedBatches={setSelectedBatches}
        exportCSV={exportCSV}
        markSelectedAsPaid={markSelectedAsPaid}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        isMobile={isMobile}
      />
    </View>
  );

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <Surface elevation={isMobile ? 0 : 1} style={[styles.recordsCard, isMobile && { flex: 1, padding: 0, margin: 0, borderRadius: 0, backgroundColor: 'transparent' }]}>
        <RecordsTable
          sortedBatches={sortedBatches}
          loading={loading}
          theme={theme}
          compactMode={false}
          selectedBatches={selectedBatches}
          setSelectedBatches={setSelectedBatches}
          toggleSelectBatch={toggleSelectBatch}
          handleSort={handleSort}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          searchQuery={searchQuery}
          ListHeaderComponent={headerComponent}
          contentContainerStyle={contentStyle}
          refreshControl={
            Platform.OS !== 'web'
              ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
              : undefined
          }
        />
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  header: {
    gap: Spacing.one,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
  recordsCard: {
    borderRadius: Spacing.four,
    overflow: 'hidden',
    minHeight: 300,
  },
});
