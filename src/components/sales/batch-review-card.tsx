import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Surface, TextInput as PaperTextInput, SegmentedButtons } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { formatCurrency } from '@/utils/currency';

export interface BatchReviewCardProps {
  batchItems: any[];
  settings: any;
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

  const batchSubtotal = batchItems.reduce((sum, item) => sum + item.total, 0);
  const safeSubtotal = Math.max(batchSubtotal, settings?.mov || 1000);

  return (
    <Surface elevation={2} style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <ThemedText type="defaultSemiBold">Items in Order ({batchItems.length})</ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          Items Subtotal: {formatCurrency(safeSubtotal)}
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
                  <ThemedText type="smallBold" style={{ color: '#EF4444' }}>Remove</ThemedText>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.formGroup, { marginTop: Spacing.four }]}>
        <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Delivery / Dispatch Cost (₦)</ThemedText>
        <PaperTextInput 
          mode="outlined"
          dense
          style={{ backgroundColor: theme.background }}
          placeholder="e.g. 2000 (0 for pickup)"
          keyboardType="numeric"
          value={deliveryCost}
          onChangeText={setDeliveryCost}
        />
      </View>

      <View style={[styles.row, { marginTop: Spacing.two }]}>
        <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Advance / Paid Amount (₦)</ThemedText>
          <PaperTextInput 
            mode="outlined"
            dense
            style={{ backgroundColor: theme.background }}
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

const styles = StyleSheet.create({
  card: {
    borderRadius: Platform.OS === 'web' ? 16 : 0,
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
    gap: Spacing.three,
  },
});
