import type { BatchAdjustment } from '@/components/records/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/ui/themed-text-input';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/currency';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SegmentedButtons, Surface } from 'react-native-paper';

export interface BatchReviewCardProps {
  batchItems: any[];
  settings: any;
  /** Sum of the rounded line totals — the goods alone. */
  subtotal: number;
  /** MOV top-up, delivery, etc. Shown as labelled rows, never folded in. */
  adjustments: BatchAdjustment[];
  /** subtotal + adjustments. */
  totalAmount: number;
  onRemoveItem: (id: string) => void;
  deliveryCost: string;
  setDeliveryCost: (val: string) => void;
  advancePayment: string;
  setAdvancePayment: (val: string) => void;
  paymentMethod: 'Cash' | 'POS' | 'Transfer';
  setPaymentMethod: (val: 'Cash' | 'POS' | 'Transfer') => void;
}

export const BatchReviewCard = React.memo(({ 
  batchItems, 
  settings, 
  subtotal,
  adjustments,
  totalAmount,
  onRemoveItem,
  deliveryCost,
  setDeliveryCost,
  advancePayment,
  setAdvancePayment,
  paymentMethod,
  setPaymentMethod
}: BatchReviewCardProps) => {
  const theme = useTheme();

  if (batchItems.length === 0) {
    return null;
  }


  return (
    <Surface elevation={2} style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <ThemedText type="defaultSemiBold">Items in Order ({batchItems.length})</ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          Items Subtotal: {formatCurrency(subtotal)}
        </ThemedText>
      </View>

      <View style={{ gap: Spacing.three }}>
        {batchItems.map((item, index) => {
          const w = parseFloat(item.width) || 0;
          const h = parseFloat(item.height) || 0;
          const area = item.jobUnit === 'ft' ? (w * h) : ((w * h) / 144);
          const effArea = area > 0 ? area : 1;

          return (
            <View key={item.id} style={[styles.batchItem, { borderColor: theme.surfaceVariant }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText type="smallBold">Item {index + 1}: {item.jobName || 'Unnamed'} ({item.material})</ThemedText>
                <ThemedText type="small" themeColor="onSurfaceVariant">
                  {item.quantity}x ({item.width}x{item.height}{item.jobUnit})
                  {item.eyelets ? ' + Eyelets' : ''}{item.lamination ? ' + Lam' : ''} {item.turnaroundTime !== 'Standard' ? `(${item.turnaroundTime})` : ''}
                </ThemedText>
                <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontStyle: 'italic' }}>
                  {effArea > 0 ? `${(effArea * (1 + (settings?.wasteFactor || 0) / 100)).toFixed(2)} sqft (inc waste) @ ${formatCurrency(item.unitPrice)}/sqft` : `${formatCurrency(item.unitPrice)}`}
                </ThemedText>
              </View>
              <View style={{ alignItems: 'flex-end', gap: Spacing.one, justifyContent: 'center' }}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  {formatCurrency(item.total)}
                </ThemedText>
                <Pressable onPress={() => onRemoveItem(item.id)}>
                  <ThemedText type="smallBold" style={{ color: theme.error }}>Remove</ThemedText>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      {/* Every naira between the subtotal and the order total, itemised. The
          minimum-order top-up used to be folded silently into the subtotal. */}
      {adjustments.length > 0 && (
        <View style={[styles.adjustments, { borderColor: theme.surfaceVariant }]}>
          {adjustments.map((adjustment, i) => (
            <View key={`${adjustment.kind}-${i}`} style={styles.adjustmentRow}>
              <ThemedText type="small" themeColor="onSurfaceVariant">{adjustment.label}</ThemedText>
              <ThemedText type="small" themeColor="onSurfaceVariant">
                {adjustment.amount < 0 ? '−' : '+'}{formatCurrency(Math.abs(adjustment.amount))}
              </ThemedText>
            </View>
          ))}
          <View style={styles.adjustmentRow}>
            <ThemedText type="smallBold">Order total</ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {formatCurrency(totalAmount)}
            </ThemedText>
          </View>
        </View>
      )}

      <View style={[styles.formGroup, { marginTop: Spacing.four }]}>
        <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Delivery / Dispatch Cost (₦)</ThemedText>
        <ThemedTextInput 
          placeholder="e.g. 2000 (0 for pickup)"
          keyboardType="numeric"
          value={deliveryCost}
          onChangeText={setDeliveryCost}
        />
      </View>

      <View style={[styles.row, { marginTop: Spacing.two }]}>
        <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Advance / Paid Amount (₦)</ThemedText>
          <ThemedTextInput 
            placeholder="e.g. 5000"
            keyboardType="numeric"
            value={advancePayment}
            onChangeText={setAdvancePayment}
          />
        </View>
        
        <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Payment Method</ThemedText>
          <SegmentedButtons
            value={paymentMethod}
            onValueChange={(val) => setPaymentMethod(val as 'Cash' | 'POS' | 'Transfer')}
            buttons={[
              { value: 'Cash', label: 'Cash' },
              { value: 'POS', label: 'POS' },
              { value: 'Transfer', label: 'Transfer' },
            ]}
            density="small"
          />
        </View>
      </View>
    </Surface>
  );
});

BatchReviewCard.displayName = 'BatchReviewCard';

const styles = StyleSheet.create({
  adjustments: {
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  adjustmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  card: {
    borderRadius: 16,
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  batchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: 8,
  },
  formGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
});
