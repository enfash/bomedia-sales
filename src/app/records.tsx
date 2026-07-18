import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { db } from '@/lib/firebase';
import { ref, update } from 'firebase/database';

import { useRecords } from '@/hooks/use-records';
import { QuotaCard } from '@/components/records/quota-card';
import { RecordsHeader } from '@/components/records/records-header';
import { RecordsTable } from '@/components/records/records-table';
import { PaymentModal } from '@/components/records/payment-modal';
import { SalesRecord } from '@/components/records/types';

export default function RecordsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const {
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
  } = useRecords(theme);

  // Additional component state
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});
  const [menuVisibleId, setMenuVisibleId] = useState<string | null>(null);

  // Payment Modal State
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedPaymentBatch, setSelectedPaymentBatch] = useState<any>(null); // can be record or batch
  const [paymentAmount, setPaymentAmount] = useState('');

  const toggleSelectBatch = (id: string) => {
    if (selectedBatches.includes(id)) {
      setSelectedBatches(selectedBatches.filter(b => b !== id));
    } else {
      setSelectedBatches([...selectedBatches, id]);
    }
  };

  const toggleBatch = (batchId: string) => {
    setExpandedBatches(prev => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  const exportCSV = () => {
    let csv = "Date,Client,Job Details,Amount,Balance,Status\n";
    const batchesToExport = selectedBatches.length > 0 ? sortedBatches.filter(b => selectedBatches.includes(b.id)) : sortedBatches;
    batchesToExport.forEach(batch => {
      const date = new Date(batch.createdAt).toLocaleDateString();
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
      await update(ref(db), updates);
      setSelectedBatches([]);
    } catch (e: any) {
      alert("Failed to mark as paid: " + e.message);
    }
  };

  const handleAddPayment = async () => {
    if (!selectedPaymentBatch || !paymentAmount) return;
    let amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    try {
      const updates: Record<string, any> = {};
      
      // Check if it's a batch (has records array) or a single record
      if (selectedPaymentBatch.records && Array.isArray(selectedPaymentBatch.records)) {
        if (selectedPaymentBatch.dbPath && selectedPaymentBatch.dbPath.split('/').length >= 3) {
           // New structured data - update batch totalPaid directly
           const currentPaid = selectedPaymentBatch.totalPaid || 0;
           updates[`${selectedPaymentBatch.dbPath}/totalPaid`] = currentPaid + amount;
        } else {
          // Legacy batch - distribute payment across unpaid items
          const sortedRecords = [...selectedPaymentBatch.records].sort((a, b) => {
            return (a.amountPaid || 0) - (b.amountPaid || 0);
          });

          for (const record of sortedRecords) {
            if (amount <= 0) break;
            const currentPaid = record.amountPaid || 0;
            const total = record.total || 0;
            const balance = total - currentPaid;
            
            if (balance > 0 && record.dbPath) {
              const amountToApply = Math.min(balance, amount);
              updates[`${record.dbPath}/amountPaid`] = currentPaid + amountToApply;
              amount -= amountToApply;
            }
          }
          
          if (amount > 0 && sortedRecords.length > 0) {
            const firstRecord = sortedRecords[0];
            if (firstRecord.dbPath) {
              const currentPaid = updates[`${firstRecord.dbPath}/amountPaid`] || firstRecord.amountPaid || 0;
              updates[`${firstRecord.dbPath}/amountPaid`] = currentPaid + amount;
            }
          }
        }
      } else {
        // It's a single record (legacy)
        const currentPaid = selectedPaymentBatch.amountPaid || 0;
        const newPaid = currentPaid + amount;
        if (selectedPaymentBatch.dbPath) {
          updates[`${selectedPaymentBatch.dbPath}/amountPaid`] = newPaid;
        }
      }
      
      await update(ref(db), updates);
      setPaymentModalVisible(false);
      setPaymentAmount('');
      setSelectedPaymentBatch(null);
    } catch (e: any) {
      alert("Failed to update payment: " + e.message);
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

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentInset={insets}
        contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
      >
        <ThemedView style={styles.container}>
          {/* Header */}
          <ThemedView style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>Data Records</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Manage sales, track balances, and log payments.
            </ThemedText>
          </ThemedView>

          <QuotaCard
            theme={theme}
            totalRevenue={totalRevenue}
            totalPaid={totalPaid}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />

          <RecordsHeader
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedBatches={selectedBatches}
            setSelectedBatches={setSelectedBatches}
            exportCSV={exportCSV}
            markSelectedAsPaid={markSelectedAsPaid}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
          />

          <ThemedView type="backgroundElement" style={styles.recordsCard}>
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
              expandedBatches={expandedBatches}
              toggleBatch={toggleBatch}
              menuVisibleId={menuVisibleId}
              setMenuVisibleId={setMenuVisibleId}
              setSelectedPaymentBatch={setSelectedPaymentBatch}
              setPaymentModalVisible={setPaymentModalVisible}
              searchQuery={searchQuery}
            />
          </ThemedView>
        </ThemedView>
      </ScrollView>

      <PaymentModal
        paymentModalVisible={paymentModalVisible}
        setPaymentModalVisible={setPaymentModalVisible}
        selectedPaymentRecord={selectedPaymentBatch}
        paymentAmount={paymentAmount}
        setPaymentAmount={setPaymentAmount}
        handleAddPayment={handleAddPayment}
        theme={theme}
      />
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
    boxShadow: '0px 4px 10px rgba(0,0,0,0.05)',
    minHeight: 300,
  },
});
