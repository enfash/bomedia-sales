/**
 * Daily Cash Reconciliation — admin only.
 *
 * The reason the payment ledger is worth building. For one day it answers:
 * how much came in, by what method, taken by whom, and how much should
 * physically be in the drawer right now.
 *
 * Reached from the More menu on mobile and the sidebar on web — an owner tool,
 * not a counter tool, so it does not take a bottom-tab slot.
 */

import type { PaymentEntry } from '@/components/records/types';
import { WebDetailShell } from '@/components/web-detail-shell';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { PageContainer } from '@/components/ui/page-container';
import { Spacing } from '@/constants/theme';
import { useAdminGate } from '@/hooks/use-admin-gate';
import { useTheme } from '@/hooks/use-theme';
import { summariseDay, todayKey } from '@/services/payment-reconciliation';
import { fetchPaymentsForDay, toPaymentEntry } from '@/services/payment-repository-pg';
import { formatCurrency } from '@/utils/currency';
import { formatDate, localDayKey } from '@/utils/date';
import { STATUS_META } from '@/utils/payment-status';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Surface } from 'react-native-paper';

const shiftDay = (dayKey: string, days: number) => {
  const [y, m, d] = dayKey.split('-').map(Number);
  return localDayKey(new Date(y, m - 1, d + days));
};

export default function CashReconciliationScreen() {
  const theme = useTheme();
  const gate = useAdminGate();
  const router = useRouter();


  // A staff member who reaches an admin route by URL is sent home rather than
  // shown a wall. The refusal page told them nothing they could act on, and a
  // route they cannot use is not a place to leave them standing.
  //
  // ONLY on `denied`. Redirecting while the role is still `pending` would bounce
  // an ADMIN who deep-links here before the users/{uid} read returns — the same
  // "not known yet is not a no" mistake the gate exists to prevent.
  useEffect(() => {
    if (gate === 'denied') router.replace('/');
  }, [gate, router]);

  const [dayKey, setDayKey] = useState(todayKey());
  const [payments, setPayments] = useState<PaymentEntry[]>([]);

  // No need to clear on day change: `summariseDay` filters by dayKey, so any
  // entries still in state from the previous day are excluded rather than
  // briefly shown.
  //
  // GATED BEFORE THE SUBSCRIPTION ATTACHES, not after. This hook used to run
  // for everyone and let the gate below decide only what was RENDERED, which
  // meant a non-admin device fetched the whole day's takings behind a screen
  // that says "Admins only" — with the security rules as the only thing
  // actually stopping it. A hook that fetches what its own gate refuses is
  // wrong on its own terms, whatever the rules happen to allow this week.
  useEffect(() => {
    if (gate !== 'allowed') return;
    let cancelled = false;
    fetchPaymentsForDay(dayKey)
      .then((rows) => {
        if (!cancelled) setPayments(rows.map(toPaymentEntry));
      })
      .catch((err) => console.warn('fetchPaymentsForDay failed:', err));
    return () => {
      cancelled = true;
    };
  }, [dayKey, gate]);

  const day = useMemo(() => summariseDay(dayKey, payments), [dayKey, payments]);
  const isToday = dayKey === todayKey();

  // The role arrives a beat after sign-in, and "not known yet" must not be
  // shown as a refusal — an admin would watch the page reject them and then
  // let them in. Both non-admin states keep the shell so the chrome holds still.
  if (gate !== 'allowed') {
    return (
      <WebDetailShell title="Daily Cash">
        <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center' }}>
          <Stack.Screen options={{ title: 'Daily Cash' }} />
          {gate === 'pending' ? (
            <View style={styles.gatePending}>
              <LoadingSkeleton width={220} height={28} borderRadius={8} />
              <LoadingSkeleton width="100%" height={140} borderRadius={16} />
              <LoadingSkeleton width="100%" height={180} borderRadius={16} />
            </View>
          ) : (
            // Rendered only for the instant before the redirect above lands.
            <EmptyState
              iconName="lock"
              title="Admins only"
              message="Taking you back to the dashboard."
            />
          )}
        </View>
      </WebDetailShell>
    );
  }

  return (
    <WebDetailShell title="Daily Cash">
      <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: 'Daily Cash', headerBackVisible: true }} />
      <PageContainer contentContainerStyle={styles.content}>
        {/* Day picker */}
        <View style={styles.dayBar}>
          <Pressable onPress={() => setDayKey(shiftDay(dayKey, -1))} hitSlop={8} style={styles.arrow}>
            <ThemedText type="defaultSemiBold" style={{ color: theme.primary }}>‹</ThemedText>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <ThemedText type="defaultSemiBold">{isToday ? 'Today' : formatDate(dayKey)}</ThemedText>
            <ThemedText type="small" themeColor="onSurfaceVariant">{dayKey}</ThemedText>
          </View>
          <Pressable
            onPress={() => !isToday && setDayKey(shiftDay(dayKey, 1))}
            hitSlop={8}
            style={[styles.arrow, isToday && { opacity: 0.3 }]}
          >
            <ThemedText type="defaultSemiBold" style={{ color: theme.primary }}>›</ThemedText>
          </Pressable>
        </View>

        {/* The number you count the drawer against */}
        <Surface style={[styles.hero, { backgroundColor: theme.primary }]} elevation={0}>
          <ThemedText type="small" style={{ color: theme.onPrimary, opacity: 0.85 }}>
            Cash that should be in the drawer
          </ThemedText>
          <ThemedText type="title" style={{ color: theme.onPrimary, fontWeight: '800' }}>
            {formatCurrency(day.expectedCashInHand)}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.onPrimary, opacity: 0.85 }}>
            Cash payments only. POS and transfers go to the bank, so they are not
            counted here. This is what was TAKEN — it includes payments against
            sales that were later voided, because that money was still collected.
          </ThemedText>
        </Surface>

        {/* Collected / reversed / net — never netted into one figure */}
        <Surface style={[styles.card, { backgroundColor: theme.elevation?.level1 || theme.surface }]} elevation={0}>
          <Row label="Collected" value={formatCurrency(day.collected)} theme={theme} />
          <Row
            label="Reversed"
            value={`−${formatCurrency(day.reversed)}`}
            theme={theme}
            color={day.reversed > 0 ? STATUS_META.Unpaid.color : undefined}
          />
          <View style={[styles.rule, { backgroundColor: theme.outlineVariant }]} />
          <Row label="Net for the day" value={formatCurrency(day.net)} theme={theme} emphasize />
          {day.reversed > 0 && (
            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.hint}>
              Reversals are corrections, not sales. A day that collected
              {' '}{formatCurrency(day.collected)} and reversed{' '}
              {formatCurrency(day.reversed)} is not the same as a quiet day.
            </ThemedText>
          )}
        </Surface>

        {/* By method */}
        <Surface style={[styles.card, { backgroundColor: theme.elevation?.level1 || theme.surface }]} elevation={0}>
          <ThemedText type="defaultSemiBold">By method</ThemedText>
          {day.byMethod.length === 0 && (
            <ThemedText type="small" themeColor="onSurfaceVariant">Nothing collected on this day.</ThemedText>
          )}
          {day.byMethod.map((m) => (
            <Row
              key={m.method}
              label={`${m.method} · ${m.count} payment${m.count === 1 ? '' : 's'}`}
              value={formatCurrency(m.net)}
              theme={theme}
            />
          ))}
        </Surface>

        {/* By staff */}
        <Surface style={[styles.card, { backgroundColor: theme.elevation?.level1 || theme.surface }]} elevation={0}>
          <ThemedText type="defaultSemiBold">By staff member</ThemedText>
          {day.byStaff.length === 0 && (
            <ThemedText type="small" themeColor="onSurfaceVariant">No takings to attribute.</ThemedText>
          )}
          {day.byStaff.map((s) => (
            <Row
              key={s.uid}
              label={`${s.name} · ${s.count} payment${s.count === 1 ? '' : 's'}`}
              value={formatCurrency(s.net)}
              theme={theme}
            />
          ))}
        </Surface>

        {/* Every entry */}
        <Surface style={[styles.card, { backgroundColor: theme.elevation?.level1 || theme.surface }]} elevation={0}>
          <ThemedText type="defaultSemiBold">Every payment</ThemedText>
          {day.entries.length === 0 && (
            <ThemedText type="small" themeColor="onSurfaceVariant">
              No payments were recorded on this day.
            </ThemedText>
          )}
          {day.entries.map((p) => (
            <View key={p.id} style={[styles.entry, { borderTopColor: theme.outlineVariant }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText type="smallBold">
                  {p.isReversal ? 'Reversal' : p.method} · {p.receiptId}
                </ThemedText>
                <ThemedText type="small" themeColor="onSurfaceVariant">
                  {p.byName}{p.note ? ` · ${p.note}` : ''}
                </ThemedText>
                {p.isReversal && p.reversalReason && (
                  <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontStyle: 'italic' }}>
                    Reason: {p.reversalReason}
                  </ThemedText>
                )}
              </View>
              <ThemedText
                type="smallBold"
                style={{ color: p.amount < 0 ? STATUS_META.Unpaid.color : STATUS_META.Paid.color }}
              >
                {p.amount < 0 ? '−' : '+'}{formatCurrency(Math.abs(p.amount))}
              </ThemedText>
            </View>
          ))}
        </Surface>
      </PageContainer>
      </View>
    </WebDetailShell>
  );
}

function Row({
  label, value, theme, emphasize, color,
}: { label: string; value: string; theme: any; emphasize?: boolean; color?: string }) {
  return (
    <View style={styles.row}>
      <ThemedText themeColor={emphasize ? undefined : 'onSurfaceVariant'} type={emphasize ? 'defaultSemiBold' : undefined}>
        {label}
      </ThemedText>
      <ThemedText
        type={emphasize ? 'defaultSemiBold' : undefined}
        style={[styles.value, color ? { color } : undefined]}
      >
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  // No horizontal padding here: PageContainer owns the shared web column
  // (WebContentMaxWidth / WebContentPaddingH). A `padding` shorthand would
  // override its paddingLeft/Right and knock this page out of line with the
  // rest of the app.
  content: { gap: Spacing.four, paddingVertical: Spacing.four },
  /** Stand-in for the page while the role read is still in flight. */
  gatePending: { flex: 1, gap: Spacing.four, padding: Spacing.four, justifyContent: 'flex-start' },
  dayBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  arrow: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  hero: { padding: Spacing.four, borderRadius: 22, gap: Spacing.two },
  card: { padding: Spacing.four, borderRadius: 22, gap: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  value: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  hint: { lineHeight: 18 },
  entry: {
    flexDirection: 'row',
    gap: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
  },
});
