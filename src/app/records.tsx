import { dbService } from '@/services/db';
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Surface } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useRecords } from '@/hooks/use-records';
import { QuotaCard } from '@/components/records/quota-card';
import { RecordsHeader } from '@/components/records/records-header';
import { RecordsTable } from '@/components/records/records-table';
import { formatDate } from '@/utils/date';

export default function RecordsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

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
  } = useRecords(theme);

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
      alert("CSV Export is currently supported on Web");
    }
  };

  const markSelectedAsPaid = async () => {
    if (selectedBatches.length === 0) return;
    
    const updates: Record<string, any> = {};
    selectedBatches.forEach(batchId => {
      const batch = sortedBatches.find(b => b.id === batchId);
      if (batch) {
        if (batch.dbPath && batch.dbPath.split('/').length >= 3) {
          // New structured data - just update batch totalPaid
          updates[`${batch.dbPath}/totalPaid`] = batch.totalAmount;
        } else {
          // Legacy data - update each item individually
          batch.records.forEach(record => {
            if (record.dbPath) {
              updates[`${record.dbPath}/amountPaid`] = record.total;
            }
          });
        }
      }
    });
    
    try {
      await dbService.updateRecord('/', updates);
      setSelectedBatches([]);
    } catch (e: any) {
      alert("Failed to mark as paid: " + e.message);
    }
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const headerComponent = (
    <View style={isMobile ? { gap: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.four } : { gap: Spacing.four, paddingBottom: Spacing.four }}>
      <ThemedView style={[styles.header, isMobile && { paddingHorizontal: Spacing.four }]}>
        <ThemedText type="subtitle" style={styles.title}>Data Records</ThemedText>
        <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
          Manage sales, track balances, and log payments.
        </ThemedText>
      </ThemedView>

      <View style={isMobile && { paddingHorizontal: Spacing.four }}>
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

  const innerContent = (
    <ThemedView style={isMobile ? { flex: 1, width: '100%' } : styles.container}>
      {!isMobile && headerComponent}

      <Surface elevation={1} style={[styles.recordsCard, isMobile && { flex: 1, padding: 0, margin: 0, borderRadius: 0, backgroundColor: 'transparent' }]}>
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
          ListHeaderComponent={isMobile ? headerComponent : undefined}
          contentContainerStyle={isMobile ? { paddingTop: insets.top, paddingBottom: insets.bottom + 80 } : undefined}
        />
      </Surface>
    </ThemedView>
  );

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      {isMobile ? (
        <View style={{ flex: 1 }}>
          {innerContent}
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentInset={insets}
          contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
        >
          {innerContent}
        </ScrollView>
      )}
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
  container: {
    maxWidth: MaxContentWidth,
    width: '100%',
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
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
