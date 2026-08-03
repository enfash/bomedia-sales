import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { usePendingFor } from '@/context/pending-writes-context';
import { useTheme } from '@/hooks/use-theme';
import { PENDING_COPY } from '@/services/pending-state';
import { withAlpha } from '@/utils/color';

/**
 * Row-level marker for a sale with an unresolved write.
 *
 * Three words, three states, and the same distinction the banner makes: the
 * chip never says "syncing" or "checking" for `unverified`, because the app is
 * not doing anything about it. The banner carries the instruction; this only
 * says which row it is about.
 */
export function PendingChip({ receiptId }: { receiptId?: string }) {
  const theme = useTheme();
  const item = usePendingFor(receiptId);
  if (!item) return null;

  const color =
    item.state === 'missing' ? theme.error : item.state === 'unverified' ? '#8A5A00' : theme.onSurfaceVariant;

  return (
    <View
      style={[styles.chip, { backgroundColor: withAlpha(color, 0.14) }]}
      accessibilityLabel={`${PENDING_COPY[item.state].headline} ${PENDING_COPY[item.state].action}`}
    >
      <ThemedText type="small" style={[styles.text, { color }]}>
        {PENDING_COPY[item.state].label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, alignSelf: 'flex-start' },
  text: { fontSize: 10, fontWeight: '700' },
});
