import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageContainer } from '@/components/ui/page-container';
import { Spacing } from '@/constants/theme';
import { useActivity } from '@/hooks/use-activity';
import { useTheme } from '@/hooks/use-theme';
import type { ActivityEntry, ActivityType } from '@/services/activity';
import { withAlpha } from '@/utils/color';
import { STATUS_META } from '@/utils/payment-status';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

/** Per-type icon + accent colour for the feed rows. */
const TYPE_META: Record<ActivityType, { icon: SymbolViewProps['name']; color: string }> = {
  sale_created: { icon: { ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }, color: STATUS_META.Paid.color },
  payment_recorded: { icon: { ios: 'creditcard.fill', android: 'payments', web: 'payments' }, color: STATUS_META.Partial.color },
  production_moved: { icon: { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' }, color: '#2e388d' },
  expense_logged: { icon: { ios: 'minus.circle.fill', android: 'remove_circle', web: 'remove_circle' }, color: STATUS_META.Unpaid.color },
  sale_deleted: { icon: { ios: 'trash.fill', android: 'delete', web: 'delete' }, color: STATUS_META.Unpaid.color },
  sale_edited: { icon: { ios: 'pencil.circle.fill', android: 'edit', web: 'edit' }, color: '#b26a00' },
};

/** "just now", "5m ago", "3h ago", "2d ago", else a date. */
function relativeTime(atMs: number): string {
  const diff = Date.now() - atMs;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(atMs).toLocaleDateString();
}

function ActivityRow({ entry, theme }: { entry: ActivityEntry; theme: any }) {
  const meta = TYPE_META[entry.type] ?? TYPE_META.sale_edited;
  return (
    <View style={[styles.row, { borderBottomColor: theme.outlineVariant }]}>
      <View style={[styles.iconWrap, { backgroundColor: withAlpha(meta.color, 0.14) }]}>
        <SymbolView name={meta.icon} size={18} tintColor={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText type="small" style={{ lineHeight: 20 }}>{entry.message}</ThemedText>
        <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontSize: 12, marginTop: 2 }}>
          {relativeTime(entry.atMs)}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * Admin activity feed — a chronological log of who did what (sales, payments,
 * production moves, expenses, deletes, edits). Opening the screen clears the
 * unread badge.
 */
export default function ActivityScreen() {
  const theme = useTheme();
  const { entries, loading, markAllSeen } = useActivity();

  // Opening the feed clears the unread watermark.
  useEffect(() => {
    markAllSeen();
  }, [markAllSeen]);

  return (
    <PageContainer>
      <Stack.Screen options={{ title: 'Activity' }} />
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={{ fontWeight: '700' }}>Activity</ThemedText>
          <ThemedText themeColor="onSurfaceVariant" style={{ fontSize: 14 }}>
            Everything your team logs, newest first.
          </ThemedText>
        </View>

        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : entries.length === 0 ? (
          <ThemedView type="surface" style={[styles.empty, { backgroundColor: theme.surfaceVariant }]}>
            <SymbolView name={{ ios: 'bell.slash', android: 'notifications_off', web: 'notifications_off' }} size={28} tintColor={theme.onSurfaceVariant} />
            <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginTop: Spacing.two, textAlign: 'center' }}>
              No activity yet. Actions your team takes will show up here.
            </ThemedText>
          </ThemedView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.six }}>
            {entries.map((e) => (
              <ActivityRow key={e.id} entry={e} theme={theme} />
            ))}
          </ScrollView>
        )}
      </ThemedView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: Spacing.four, paddingHorizontal: Spacing.four },
  header: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    borderRadius: 16,
    padding: Spacing.five,
    alignItems: 'center',
  },
});
