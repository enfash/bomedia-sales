import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { usePendingWrites } from '@/context/pending-writes-context';
import { useTheme } from '@/hooks/use-theme';
import { copyFor, type PendingItem, type PendingState } from '@/services/pending-state';
import { summarise } from '@/services/pending-state';
import { formatCurrency } from '@/utils/currency';
import { withAlpha } from '@/utils/color';

/**
 * The one place the operator is told a write may not have landed.
 *
 * THREE STATES, THREE VOICES, NEVER COLLAPSED. `unverified` is the common one
 * — captive portal, expired token, dropped connection all land there — so it is
 * written as uncertainty, not as progress. No spinner, no "checking…", no
 * ellipsis: the app is not working on it. It asked and got no answer, and the
 * only safe instruction is to write it on paper.
 *
 * Nothing here dismisses itself on a timer or on a reconnect. An entry leaves
 * only when the server confirms it, or when the operator says they have dealt
 * with it.
 */
export function PendingWritesBanner() {
  const theme = useTheme();
  const { items, dismiss } = usePendingWrites();
  const [expanded, setExpanded] = useState(false);
  // This is now the topmost element in the tree, so it owns the status-bar
  // inset. Without it the warning renders UNDER the clock and battery, which is
  // where it was least readable and most easily mistaken for chrome. The
  // padding is inside the coloured container, so the tint runs to the top of
  // the screen rather than leaving a strip above it. Zero on web.
  const insets = useSafeAreaInsets();

  const summary = summarise(items);
  if (!summary) return null;

  const tone = toneFor(summary.state, theme);
  // The lead line borrows the copy of the worst item, so it never tells the
  // operator to re-enter something the outbox is already resending.
  const worst = [...items].sort((a, b) => (a.state === summary.state ? -1 : 1))[0];
  const summaryAction = copyFor(worst).action;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: tone.bg, borderBottomColor: tone.border, paddingTop: insets.top },
      ]}
    >
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${summary.text}. ${expanded ? 'Hide' : 'Show'} details`}
        style={styles.summaryRow}
      >
        <Feather name={tone.icon} size={16} color={tone.fg} />
        <ThemedText type="small" style={[styles.summaryText, { color: tone.fg }]} numberOfLines={2}>
          {summary.text} — {summaryAction}
        </ThemedText>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={tone.fg} />
      </Pressable>

      {expanded ? (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {items.map((item) => (
            <PendingRow key={item.entry.key} item={item} onDismiss={() => dismiss(item.entry.key)} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function PendingRow({ item, onDismiss }: { item: PendingItem; onDismiss: () => void }) {
  const theme = useTheme();
  const copy = copyFor(item);
  const { entry } = item;
  const tone = toneFor(item.state, theme);

  return (
    <View style={[styles.row, { borderColor: theme.outlineVariant }]}>
      <View style={styles.rowHead}>
        <View style={[styles.chip, { backgroundColor: withAlpha(tone.fg, 0.14) }]}>
          <ThemedText type="small" style={{ color: tone.fg, fontSize: 11, fontWeight: '700' }}>
            {copy.label}
          </ThemedText>
        </View>
        <ThemedText type="small" style={{ fontWeight: '700' }}>
          {formatCurrency(entry.amount)}
          {entry.method ? ` · ${entry.method}` : ''}
        </ThemedText>
      </View>

      <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.rowDetail}>
        {entry.kind === 'sale' ? 'Sale' : entry.kind === 'reversal' ? 'Reversal' : 'Payment'}
        {entry.clientName ? ` for ${entry.clientName}` : ''}
        {entry.receiptId ? ` · ${entry.receiptId}` : ''}
        {` · ${new Date(entry.atMs).toLocaleString()}`}
      </ThemedText>

      <ThemedText type="small" style={{ color: tone.fg }}>
        {copy.headline} {copy.action}
      </ThemedText>

      {/* Only the operator closes a warning. `pending` has no button: the app is
          genuinely still trying, and there is nothing yet to have dealt with. */}
      {item.state === 'pending' ? null : (
        <Pressable onPress={onDismiss} accessibilityRole="button" style={styles.dismiss}>
          <ThemedText type="small" style={{ color: theme.primary, fontWeight: '600' }}>
            I&apos;ve dealt with this
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function toneFor(state: PendingState, theme: ReturnType<typeof useTheme>) {
  // Colour carries the same three-way distinction as the words, so the two
  // never disagree: red for act now, amber for unknown, neutral for waiting.
  if (state === 'missing') {
    return { fg: theme.error, bg: withAlpha(theme.error, 0.1), border: withAlpha(theme.error, 0.35), icon: 'alert-triangle' as const };
  }
  if (state === 'unverified') {
    return { fg: '#8A5A00', bg: '#FFF4E0', border: '#E8C88A', icon: 'help-circle' as const };
  }
  return {
    fg: theme.onSurfaceVariant,
    bg: theme.surfaceVariant,
    border: theme.outlineVariant,
    icon: 'upload-cloud' as const,
  };
}

const styles = StyleSheet.create({
  container: { borderBottomWidth: 1 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  summaryText: { flex: 1, fontWeight: '600' },
  list: { maxHeight: 260 },
  listContent: { padding: Spacing.three, gap: Spacing.two },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
    backgroundColor: 'transparent',
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  rowDetail: { fontSize: 12 },
  dismiss: { paddingTop: Spacing.one, alignSelf: 'flex-start' },
});
