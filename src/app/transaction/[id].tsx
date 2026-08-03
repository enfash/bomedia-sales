import { PaymentModal } from '@/components/records/payment-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { PageContainer } from '@/components/ui/page-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useRecords } from '@/hooks/use-records';
import { useTheme } from '@/hooks/use-theme';
import { describeWriteError } from '@/utils/errors';
import { logActivity } from '@/services/activity';
import { voidBatch } from '@/services/sales-repository';
import { VoidModal } from '@/components/records/void-modal';
import { recordPayment, subscribeToPaymentsForSale } from '@/services/payment-repository';
import { attachPayments, describeMismatch } from '@/services/payment-reconciliation';
import { PaymentHistory } from '@/components/records/payment-history';
import { WebDetailShell } from '@/components/web-detail-shell';
import type { PaymentEntry, PaymentMethod } from '@/components/records/types';
import { withAlpha } from '@/utils/color';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { STATUS_META } from '@/utils/payment-status';
import { SymbolView } from 'expo-symbols';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
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

  const { isAdmin, actor } = useAuth();
  // Opt in, and look up from the UNFILTERED list: every list hides voided
  // sales, but opening one by id must still work so its reason can be read.
  const { allBatches, loading } = useRecords(theme, { includeVoided: true });
  const transaction = allBatches.find((b) => b.id === id);

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);

  // Scoped to THIS sale via its paymentRefs index, rather than subscribing to
  // the whole ledger and filtering. Staff still only receive their own entries
  // — the rules enforce that at the uid level, not the UI.
  useEffect(() => {
    if (!transaction?.dbPath) return;
    return subscribeToPaymentsForSale(transaction.dbPath, setPayments);
  }, [transaction?.dbPath]);

  const handleAddPayment = async () => {
    if (!transaction || !paymentAmount) return;
    // Guard the double-tap: offline the write does not resolve until reconnect,
    // and under an append-only ledger a second tap queues a SECOND entry.
    if (isRecording) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;

    setIsRecording(true);
    try {
      await recordPayment({
        batch: transaction,
        amount,
        method: paymentMethod,
        note: paymentNote,
        actor: actor,
      });
      logActivity({
        type: 'payment_recorded',
        actor: actor,
        message: `${actor.name} recorded a ${formatCurrency(amount)} ${paymentMethod} payment for ${transaction.clientName || 'a client'}`,
        meta: { batchId: transaction.id, amount },
      });
      setPaymentModalVisible(false);
      setPaymentAmount('');
      setPaymentNote('');
    } catch (e: any) {
      const message = describeWriteError(e, 'record this payment');
      Alert.alert(message.title, message.body);
    } finally {
      setIsRecording(false);
    }
  };

  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

  const handleVoid = async (reason: string) => {
    if (!transaction || isVoiding) return;
    setIsVoiding(true);
    try {
      await voidBatch(transaction, reason, actor);
      logActivity({
        type: 'sale_deleted',
        actor: actor,
        message: `${actor.name} voided a ${formatCurrency(transaction.totalAmount)} sale for ${transaction.clientName || 'a client'} — ${reason}`,
        meta: { batchId: transaction.id, reason },
      });
      setVoidModalVisible(false);
      router.back();
    } catch (error: any) {
      const message = describeWriteError(error, 'void this sale');
      Alert.alert(message.title, message.body);
    } finally {
      setIsVoiding(false);
    }
  };

  const handleDelete = () => setVoidModalVisible(true);

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
      <WebDetailShell title="Transaction Details">
      <View style={{ flex: 1, padding: Spacing.four, backgroundColor: theme.background, gap: Spacing.four }}>
        <LoadingSkeleton width="100%" height={100} borderRadius={16} />
        <LoadingSkeleton width="100%" height={200} borderRadius={16} />
      </View>
      </WebDetailShell>
    );
  }

  if (!transaction) {
    return (
      <WebDetailShell title="Not Found">
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
      </WebDetailShell>
    );
  }

  // BUG FIX — `subtotal` used to be `grandTotal - delivery`, which folded the
  // MOV top-up silently into the figure labelled "Subtotal". On a ₦600 job with
  // ₦2,000 delivery it showed ₦1,000 of printing that never existed. Both
  // figures now come from the batch, where they are a stored write-time
  // snapshot rather than a number reverse-engineered by subtraction.
  const grandTotal = transaction.totalAmount;
  const subtotal = transaction.subtotal;
  const adjustments = transaction.adjustments;

  // Join the ledger to this sale. Staff see only their own entries, so their
  // view is partial by design and mismatches must not be flagged to them.
  const [withPayments] = attachPayments([transaction], payments, { trustMismatch: isAdmin });
  const initials = (transaction.clientName || 'U').substring(0, 2).toUpperCase();

  return (
    <WebDetailShell title="Transaction Details">
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

          {transaction.isVoided && (
            <View style={[styles.voidBanner, { backgroundColor: STATUS_META.Unpaid.bg }]}>
              <ThemedText type="defaultSemiBold" style={{ color: STATUS_META.Unpaid.color }}>
                This sale was voided
              </ThemedText>
              <ThemedText type="small" style={{ color: STATUS_META.Unpaid.color, lineHeight: 18 }}>
                {transaction.voidedByName ? `Voided by ${transaction.voidedByName}` : 'Voided'}
                {transaction.voidedAt ? ` on ${formatDate(transaction.voidedAt)}` : ''}
                {transaction.voidReason ? ` — ${transaction.voidReason}` : ''}
              </ThemedText>
              <ThemedText type="small" style={{ color: STATUS_META.Unpaid.color, lineHeight: 18 }}>
                It is excluded from every total, the dashboard and the board. Any
                payments already collected stay in the ledger and in Daily Cash.
              </ThemedText>
            </View>
          )}

          <PaymentHistory
            payments={withPayments.payments}
            theme={theme}
            isPartialView={!isAdmin}
            mismatchMessage={
              withPayments.hasMismatch ? describeMismatch(withPayments, formatCurrency) : undefined
            }
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
              adjustments={adjustments}
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
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          paymentNote={paymentNote}
          setPaymentNote={setPaymentNote}
          isSubmitting={isRecording}
          paymentModalVisible={paymentModalVisible}
          setPaymentModalVisible={setPaymentModalVisible}
          selectedPaymentRecord={transaction}
          paymentAmount={paymentAmount}
          setPaymentAmount={setPaymentAmount}
          handleAddPayment={handleAddPayment}
          theme={theme}
        />
        <VoidModal
          visible={voidModalVisible}
          onClose={() => setVoidModalVisible(false)}
          receiptId={transaction.receiptId || transaction.id}
          kind="sale"
          collected={transaction.totalPaid || 0}
          onConfirm={handleVoid}
          isSubmitting={isVoiding}
          theme={theme}
        />
      </Portal>
    </View>
    </WebDetailShell>
  );
}

const styles = StyleSheet.create({
  voidBanner: { padding: Spacing.four, borderRadius: 16, gap: Spacing.one },
  scrollContent: {
    paddingBottom: Spacing.six,
  },
  stack: {
    // Native needs this inset; on web PageContainer already applies
    // WebContentPaddingH, so adding it again would push this page's column
    // 16px narrower than every other screen.
    padding: Platform.OS === 'web' ? 0 : Spacing.four,
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
