import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ClientInfoCard, ClientInfoRef } from '@/components/sales/client-info-card';
import { JobDetailCard } from '@/components/sales/job-detail-card';
import { PageContainer } from '@/components/ui/page-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ThemedTextInput } from '@/components/ui/themed-text-input';
import type { QuoteRecord, QuoteStatus } from '@/components/records/types';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  MissingQuoteInfoError,
  convertQuoteToSale,
  createQuote,
  deleteQuote,
  subscribeToQuotes,
  updateQuoteDetails,
} from '@/services/quote-repository';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { STATUS_META } from '@/utils/payment-status';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, Share, StyleSheet, View } from 'react-native';
import { Surface } from 'react-native-paper';

const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; color: string; bg: string }> = {
  Draft: { label: 'Draft', color: STATUS_META.Partial.color, bg: STATUS_META.Partial.bg },
  Sent: { label: 'Sent', color: STATUS_META.Overpaid.color, bg: STATUS_META.Overpaid.bg },
  Converted: { label: 'Converted', color: STATUS_META.Paid.color, bg: STATUS_META.Paid.bg },
};

export default function QuoteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const clientInfoRef = useRef<ClientInfoRef>(null);

  // 'list' = saved quotes; 'new' = the entry form.
  const [mode, setMode] = useState<'list' | 'new'>('list');

  const [items, setItems] = useState<any[]>([]);
  const [deliveryCost, setDeliveryCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);

  // "Complete details" modal for converting a quote with missing info.
  const [pendingQuote, setPendingQuote] = useState<QuoteRecord | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalContact, setModalContact] = useState('');

  useEffect(() => subscribeToQuotes(setQuotes), []);

  const addItem = useCallback((item: any) => setItems((prev) => [...prev, item]), []);
  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const subtotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
  const total = subtotal + (parseFloat(deliveryCost) || 0);

  const resetForm = () => {
    setItems([]);
    setDeliveryCost('');
    setNotes('');
    clientInfoRef.current?.reset();
  };

  const handleSaveQuote = async () => {
    if (items.length === 0) {
      Alert.alert('Add an item', 'A quote needs at least one job item before you can save it.');
      return;
    }
    const client = clientInfoRef.current?.getData();
    setSaving(true);
    try {
      await createQuote({
        clientName: client?.clientName?.trim() || '',
        contact: client?.contact?.trim() || '',
        totalAmount: total,
        deliveryCost: parseFloat(deliveryCost) || 0,
        items,
        notes: notes.trim() || undefined,
      });
      resetForm();
      setMode('list');
      Alert.alert('Quote saved', 'Your quote is saved. Convert it to a sale anytime.');
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  const shareQuote = async (quote: QuoteRecord) => {
    const lines = quote.records
      .map((r) => `• ${r.material} ${r.width}x${r.height}${r.jobUnit} ×${r.quantity} — ${formatCurrency(r.total || 0)}`)
      .join('\n');
    const message = `Quote ${quote.quoteId}
${quote.clientName ? `For: ${quote.clientName}\n` : ''}Date: ${formatDate(quote.createdAt)}

${lines}

Estimated total: ${formatCurrency(quote.totalAmount)}`;
    try {
      await Share.share({ message, title: `Quote ${quote.quoteId}` });
    } catch (e: any) {
      Alert.alert('Could not share', e.message);
    }
  };

  const showConverted = () =>
    Alert.alert('Converted to sale', 'This quote is now a sales record.', [
      { text: 'View in Records', onPress: () => router.push('/records') },
      { text: 'OK' },
    ]);

  const handleConvert = async (quote: QuoteRecord) => {
    try {
      await convertQuoteToSale(quote);
      showConverted();
    } catch (e) {
      if (e instanceof MissingQuoteInfoError) {
        // Ask the user to fill in the missing critical info, then retry.
        setModalName(quote.clientName || '');
        setModalContact(quote.contact || '');
        setPendingQuote(quote);
      } else {
        Alert.alert('Could not convert', (e as Error).message);
      }
    }
  };

  const submitPending = async () => {
    if (!pendingQuote) return;
    if (!modalName.trim()) {
      Alert.alert('Client name required', 'Please enter a client name to continue.');
      return;
    }
    const quote = pendingQuote;
    setPendingQuote(null);
    try {
      await updateQuoteDetails(quote, { clientName: modalName.trim(), contact: modalContact.trim() });
      await convertQuoteToSale({ ...quote, clientName: modalName.trim(), contact: modalContact.trim() });
      showConverted();
    } catch (e: any) {
      Alert.alert('Could not convert', e.message);
    }
  };

  const confirmDelete = (quote: QuoteRecord) => {
    Alert.alert('Delete quote', `Delete quote ${quote.quoteId}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteQuote(quote) },
    ]);
  };

  /* ---------------------------------- FORM ---------------------------------- */
  if (mode === 'new') {
    return (
      <>
        <PageContainer footerHeight={items.length > 0 ? 88 : 0}>
          <ThemedView style={styles.container}>
            <View style={styles.formHeader}>
              <Pressable onPress={() => setMode('list')} style={[styles.backBtn, { borderColor: theme.surfaceVariant }]} hitSlop={8}>
                <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor={theme.onSurface} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <ThemedText type="subtitle" style={styles.title}>New Quote</ThemedText>
                <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
                  Build an estimate — save it, then convert to a sale anytime.
                </ThemedText>
              </View>
            </View>

            <ClientInfoCard ref={clientInfoRef} />
            <JobDetailCard onAddToBatch={addItem} />

            {items.length > 0 && (
              <Surface elevation={1} style={[styles.card, { backgroundColor: theme.surface }]}>
                <View style={styles.rowBetween}>
                  <ThemedText type="defaultSemiBold">Quote Items ({items.length})</ThemedText>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Subtotal: {formatCurrency(subtotal)}
                  </ThemedText>
                </View>

                <View style={{ gap: Spacing.three, marginTop: Spacing.three }}>
                  {items.map((item, index) => (
                    <View key={item.id} style={[styles.itemRow, { borderColor: theme.surfaceVariant }]}>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="smallBold">{index + 1}. {item.jobName || item.material}</ThemedText>
                        <ThemedText type="small" themeColor="onSurfaceVariant">
                          {item.material} · {item.width}x{item.height}{item.jobUnit} · ×{item.quantity}
                        </ThemedText>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: Spacing.one }}>
                        <ThemedText type="smallBold" style={{ color: theme.primary }}>{formatCurrency(item.total)}</ThemedText>
                        <Pressable onPress={() => removeItem(item.id)}>
                          <ThemedText type="smallBold" style={{ color: theme.error }}>Remove</ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={{ marginTop: Spacing.four, gap: Spacing.three }}>
                  <View>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Delivery / Dispatch Cost (₦)</ThemedText>
                    <ThemedTextInput placeholder="e.g. 2000 (0 for pickup)" keyboardType="numeric" value={deliveryCost} onChangeText={setDeliveryCost} />
                  </View>
                  <View>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Notes (optional)</ThemedText>
                    <ThemedTextInput placeholder="Terms, validity, special instructions…" multiline numberOfLines={3} value={notes} onChangeText={setNotes} />
                  </View>
                </View>
              </Surface>
            )}
          </ThemedView>
        </PageContainer>

        {items.length > 0 && (
          <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.surfaceVariant }]}>
            <View>
              <ThemedText type="small" themeColor="onSurfaceVariant">Quote total</ThemedText>
              <ThemedText type="subtitle" style={{ color: theme.primary, fontWeight: '700' }}>{formatCurrency(total)}</ThemedText>
            </View>
            <PrimaryButton onPress={handleSaveQuote} loading={saving} disabled={saving} style={{ paddingHorizontal: 16 }}>
              Save Quote
            </PrimaryButton>
          </View>
        )}
      </>
    );
  }

  /* ---------------------------------- LIST ---------------------------------- */
  return (
    <>
      <PageContainer>
        <ThemedView style={styles.container}>
          <View style={[styles.formHeader, { alignItems: 'center' }]}>
            <View style={{ flex: 1 }}>
              <ThemedText type="subtitle" style={styles.title}>Quotes</ThemedText>
              <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
                Estimates waiting to convert to a sale.
              </ThemedText>
            </View>
            <Pressable
              onPress={() => setMode('new')}
              style={[styles.addBtn, { backgroundColor: theme.primary }]}
              accessibilityLabel="Add quote"
            >
              <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={theme.onPrimary} />
              <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>Add Quote</ThemedText>
            </Pressable>
          </View>

          {quotes.length === 0 ? (
            <Surface elevation={0} style={[styles.emptyCard, { backgroundColor: theme.surfaceVariant }]}>
              <SymbolView name={{ ios: 'doc.text', android: 'description', web: 'description' }} size={30} tintColor={theme.onSurfaceVariant} />
              <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginTop: Spacing.two, textAlign: 'center' }}>
                No quotes yet. Tap &ldquo;Add Quote&rdquo; to build your first estimate.
              </ThemedText>
            </Surface>
          ) : (
            <View style={{ gap: Spacing.three, paddingHorizontal: Spacing.four }}>
              {quotes.map((quote) => {
                const meta = QUOTE_STATUS_META[quote.status];
                const converted = quote.status === 'Converted';
                return (
                  <Surface key={quote.id} elevation={1} style={[styles.card, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="defaultSemiBold">{quote.clientName || 'No client name'}</ThemedText>
                        <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontVariant: ['tabular-nums'] }}>
                          {quote.quoteId} · {formatDate(quote.createdAt)} · {quote.records.length} item{quote.records.length !== 1 ? 's' : ''}
                        </ThemedText>
                      </View>
                      <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                        <ThemedText type="small" style={{ color: meta.color, fontWeight: '700' }}>{meta.label}</ThemedText>
                      </View>
                    </View>

                    <View style={[styles.rowBetween, { marginTop: Spacing.two }]}>
                      <ThemedText type="small" themeColor="onSurfaceVariant">Estimated total</ThemedText>
                      <ThemedText type="defaultSemiBold" style={{ color: theme.primary, fontVariant: ['tabular-nums'] }}>
                        {formatCurrency(quote.totalAmount)}
                      </ThemedText>
                    </View>

                    <View style={[styles.actionsRow, { borderTopColor: theme.surfaceVariant }]}>
                      <Pressable style={styles.action} onPress={() => shareQuote(quote)}>
                        <SymbolView name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }} size={16} tintColor={theme.onSurfaceVariant} />
                        <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontWeight: '600' }}>Share</ThemedText>
                      </Pressable>
                      <Pressable style={styles.action} onPress={() => confirmDelete(quote)}>
                        <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={16} tintColor={theme.error} />
                        <ThemedText type="small" style={{ color: theme.error, fontWeight: '600' }}>Delete</ThemedText>
                      </Pressable>
                      {!converted && (
                        <Pressable style={[styles.action, styles.convert, { backgroundColor: theme.primary }]} onPress={() => handleConvert(quote)}>
                          <SymbolView name={{ ios: 'arrow.right.circle.fill', android: 'arrow_forward', web: 'arrow_forward' }} size={16} tintColor={theme.onPrimary} />
                          <ThemedText type="small" style={{ color: theme.onPrimary, fontWeight: '700' }}>Convert to Sale</ThemedText>
                        </Pressable>
                      )}
                    </View>
                  </Surface>
                );
              })}
            </View>
          )}
        </ThemedView>
      </PageContainer>

      {/* Complete-details modal (missing critical info on convert) */}
      <Modal visible={!!pendingQuote} transparent animationType="fade" onRequestClose={() => setPendingQuote(null)}>
        <View style={styles.modalOverlay}>
          <Surface elevation={4} style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <ThemedText type="subtitle">Complete details</ThemedText>
            <ThemedText type="small" themeColor="onSurfaceVariant">
              A client name is required before this quote can become a sale.
            </ThemedText>
            <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
              <View>
                <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Client / Company Name</ThemedText>
                <ThemedTextInput placeholder="Enter client name" value={modalName} onChangeText={setModalName} autoFocus />
              </View>
              <View>
                <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Contact (optional)</ThemedText>
                <ThemedTextInput placeholder="Phone / email" value={modalContact} onChangeText={setModalContact} />
              </View>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setPendingQuote(null)}>
                <ThemedText type="smallBold" themeColor="onSurfaceVariant">Cancel</ThemedText>
              </Pressable>
              <PrimaryButton onPress={submitPending} style={{ flex: 1 }}>Save &amp; Convert</PrimaryButton>
            </View>
          </Surface>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: Spacing.four },
  formHeader: { flexDirection: 'row', gap: Spacing.three, paddingHorizontal: Spacing.four },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 12 },
  title: { fontWeight: '700' },
  subtitle: { fontSize: 14 },
  card: { borderRadius: 16, padding: Spacing.four, marginHorizontal: Spacing.four },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.three, borderWidth: 1, borderRadius: 8 },
  label: { marginBottom: 4 },
  emptyCard: { marginHorizontal: Spacing.four, borderRadius: 16, padding: Spacing.five, alignItems: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  actionsRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  convert: { marginLeft: 'auto' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.four, borderTopWidth: 1,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.four },
  modalCard: { borderRadius: 20, padding: Spacing.four, gap: Spacing.two },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.four },
  modalCancel: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
});
