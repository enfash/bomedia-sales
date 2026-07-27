import { PaymentModal } from '@/components/records/payment-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { PageContainer } from '@/components/ui/page-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Spacing } from '@/constants/theme';
import { useRecords } from '@/hooks/use-records';
import { useTheme } from '@/hooks/use-theme';
import { deleteBatch, recordPayment } from '@/services/sales-repository';
import { withAlpha } from '@/utils/color';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { STATUS_META } from '@/utils/payment-status';
import { SymbolView } from 'expo-symbols';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import { Portal, Surface } from 'react-native-paper';

import { TransactionActionBar } from '@/components/records/transaction-action-bar';
import { TransactionCostBreakdown } from '@/components/records/transaction-cost-breakdown';
import { TransactionItemRow } from '@/components/records/transaction-item-row';
import { TransactionSummaryCard } from '@/components/records/transaction-summary-card';
import { ThemedText } from '@/components/themed-text';

/** Best-effort international format for wa.me (numbers are Nigerian: 0… → 234…). */
function toWhatsAppNumber(contact: string): string {
  let n = contact.replace(/\D/g, '');
  if (n.startsWith('0')) n = `234${n.slice(1)}`;
  return n;
}

export default function TransactionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const { sortedBatches, loading } = useRecords(theme);
  const transaction = sortedBatches.find(b => b.id === id);

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');

  const handleAddPayment = async () => {
    if (!transaction || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      await recordPayment(transaction, amount);
      setPaymentModalVisible(false);
      setPaymentAmount('');
    } catch (e: any) {
      alert('Failed to update payment: ' + e.message);
    }
  };

  const handleDelete = () => {
    if (!transaction) return;

    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBatch(transaction);
              router.back();
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete transaction: ' + error.message);
            }
          },
        },
      ],
    );
  };

  const handleShare = async () => {
    if (!transaction) return;

    try {
      const itemsString = transaction.records.map(r =>
        `- ${r.material} (${r.width}x${r.height} ${r.jobUnit}): ${formatCurrency(r.total || 0)}`
      ).join('\n');

      const message = `Invoice: #${transaction.id.substring(0, 8).toUpperCase()}
Customer: ${transaction.clientName || 'Unknown'}
Grand Total: ${formatCurrency(transaction.totalAmount)}
Outstanding Balance: ${formatCurrency(transaction.totalBalance)}

Items:
${itemsString}`;

      await Share.share({
        message,
        title: `Invoice #${transaction.id.substring(0, 8).toUpperCase()}`,
      });
    } catch (error: any) {
      Alert.alert('Error', 'Failed to share: ' + error.message);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, padding: Spacing.four, backgroundColor: theme.background, gap: Spacing.four }}>
        <LoadingSkeleton width="100%" height={100} borderRadius={16} />
        <LoadingSkeleton width="100%" height={200} borderRadius={16} />
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center' }}>
        <Stack.Screen options={{ title: 'Not Found', headerBackVisible: true }} />
        <EmptyState
          iconName="doc.text.magnifyingglass"
          title="Transaction not found"
          message="The transaction you are looking for does not exist or has been removed."
        />
        <View style={{ paddingHorizontal: Spacing.four }}>
          <PrimaryButton onPress={() => router.back()}>Go Back</PrimaryButton>
        </View>
      </View>
    );
  }

  const delivery = transaction.deliveryCost || 0;
  const grandTotal = transaction.totalAmount;
  const subtotal = grandTotal - delivery;
  const initials = (transaction.clientName || 'U').substring(0, 2).toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: 'Transaction Details', headerBackVisible: true }} />

      <PageContainer contentContainerStyle={styles.scrollContent}>
        <View style={styles.stack}>
          <TransactionSummaryCard
            totalAmount={transaction.totalAmount}
            totalPaid={transaction.totalPaid || 0}
            totalBalance={transaction.totalBalance}
            status={transaction.status}
            paymentMethod={transaction.paymentMethod}
          />

          {/* Client */}
          <Surface
            style={[styles.clientCard, { backgroundColor: theme.elevation?.level1 || theme.surface }]}
            elevation={0}
          >
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <ThemedText style={{ color: theme.onPrimary, fontWeight: '700', fontSize: 18 }}>{initials}</ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
                {transaction.clientName || 'Unknown Client'}
              </ThemedText>
              <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontVariant: ['tabular-nums'] }}>
                #{transaction.id.substring(0, 8).toUpperCase()} · {formatDate(transaction.createdAt)}
              </ThemedText>
            </View>
            {transaction.contact ? (
              <View style={styles.contactBtns}>
                <Pressable
                  onPress={() => Linking.openURL(`https://wa.me/${toWhatsAppNumber(transaction.contact!)}`)}
                  style={[styles.contactBtn, { backgroundColor: withAlpha(STATUS_META.Paid.color, 0.14) }]}
                  accessibilityLabel="Message client on WhatsApp"
                >
                  <SymbolView name={{ ios: 'message.fill', android: 'chat', web: 'chat' }} size={18} tintColor={STATUS_META.Paid.color} />
                </Pressable>
                <Pressable
                  onPress={() => Linking.openURL(`tel:${transaction.contact}`)}
                  style={[styles.contactBtn, { backgroundColor: withAlpha(theme.primary, 0.12) }]}
                  accessibilityLabel="Call client"
                >
                  <SymbolView name={{ ios: 'phone.fill', android: 'call', web: 'call' }} size={18} tintColor={theme.primary} />
                </Pressable>
              </View>
            ) : null}
          </Surface>

          {/* Items */}
          <View>
            <View style={styles.sectionHead}>
              <ThemedText type="subtitle">Items</ThemedText>
              <View style={[styles.countPill, { backgroundColor: theme.surfaceVariant }]}>
                <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
                  {transaction.records.length}
                </ThemedText>
              </View>
            </View>
            <Surface
              style={[styles.itemsCard, { backgroundColor: theme.elevation?.level1 || theme.surface }]}
              elevation={0}
            >
              {transaction.records.map((item, index) => (
                <TransactionItemRow
                  key={item.id}
                  material={item.material}
                  width={item.width as any}
                  height={item.height as any}
                  jobUnit={item.jobUnit}
                  quantity={item.quantity}
                  total={item.total || 0}
                  showDivider={index > 0}
                />
              ))}
            </Surface>
          </View>

          {/* Cost breakdown */}
          <View>
            <ThemedText type="subtitle" style={{ marginBottom: Spacing.three }}>Cost breakdown</ThemedText>
            <TransactionCostBreakdown
              subtotal={subtotal}
              delivery={delivery}
              vat={0}
              grandTotal={grandTotal}
              amountPaid={transaction.totalPaid || 0}
              totalBalance={transaction.totalBalance}
            />
          </View>
        </View>

        {/* Spacing for the bottom action bar */}
        <View style={{ height: 100 }} />
      </PageContainer>

      <TransactionActionBar
        totalBalance={transaction.totalBalance}
        onPrintInvoice={() => router.push(`/invoice?batchId=${transaction.id}`)}
        onShare={handleShare}
        onDelete={handleDelete}
        onRecordPayment={() => setPaymentModalVisible(true)}
      />

      <Portal>
        <PaymentModal
          paymentModalVisible={paymentModalVisible}
          setPaymentModalVisible={setPaymentModalVisible}
          selectedPaymentRecord={transaction}
          paymentAmount={paymentAmount}
          setPaymentAmount={setPaymentAmount}
          handleAddPayment={handleAddPayment}
          theme={theme}
        />
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: Spacing.six,
  },
  stack: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: 22,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactBtns: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  contactBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  countPill: {
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 999,
  },
  itemsCard: {
    borderRadius: 22,
    padding: Spacing.two,
  },
});
