import { useMemo } from 'react';
import { DeviceEventEmitter, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Surface } from 'react-native-paper';

import { ThemedText } from '@/components/themed-text';
import { OPEN_MORE_EVENT } from '@/components/more-menu';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { PageContainer } from '@/components/ui/page-container';
import { Sparkline } from '@/components/ui/sparkline';
import { StatusChip } from '@/components/ui/status-chip';
import type { SalesBatch } from '@/components/records/types';
import { UserAvatar } from '@/components/user/user-avatar';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useExpenses } from '@/hooks/use-expenses';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { useRecords } from '@/hooks/use-records';
import {
  LedgerIntegrityBanner,
  LedgerIntegrityNote,
  useLedgerIntegrity,
} from '@/components/records/ledger-integrity-banner';
import { useTheme } from '@/hooks/use-theme';
import {
  clientsOwing,
  computeDashboardMetrics,
  productionThroughput,
  readyJobs,
  recentSales,
  revenueByDay,
} from '@/services/analytics';
import { withAlpha } from '@/utils/color';
import { formatCurrency } from '@/utils/currency';
import { isToday, parseDate } from '@/utils/date';
import { STATUS_META } from '@/utils/payment-status';
import { STAGE_META } from '@/utils/production-stage';

/** Compact money, e.g. ₦1.2m / ₦450k / ₦900 — keeps big figures scannable. */
function compactMoney(v: number): string {
  const sign = v < 0 ? '-' : '';
  const n = Math.abs(v);
  if (n >= 1_000_000) return `${sign}₦${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (n >= 1_000) return `${sign}₦${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return `${sign}₦${Math.round(n)}`;
}

export default function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { expenses, loading: expensesLoading, refresh: refreshExpenses } = useExpenses(currentMonth);
  const { sortedBatches, loading: recordsLoading, refresh: refreshRecords } = useRecords(theme);
  const loading = recordsLoading || expensesLoading;
  const { refreshing, onRefresh } = usePullRefresh([refreshRecords, refreshExpenses]);

  const metrics = useMemo(() => computeDashboardMetrics(sortedBatches, expenses), [sortedBatches, expenses]);
  // One subscription feeding both surfaces: the banner at the top when
  // something is wrong, the quiet note at the bottom when nothing is.
  const integrity = useLedgerIntegrity({
    batches: sortedBatches,
    batchesReceived: !recordsLoading,
  });
  const stages = useMemo(() => productionThroughput(sortedBatches), [sortedBatches]);
  const ready = useMemo(() => readyJobs(sortedBatches), [sortedBatches]);
  const owing = useMemo(() => clientsOwing(sortedBatches), [sortedBatches]);
  const days7 = useMemo(() => revenueByDay(sortedBatches, 7), [sortedBatches]);
  // TODAY only, for everyone — the dashboard is a "what is happening now"
  // screen, and a card mixing today's sales with last week's invites the
  // operator to read an old total as the day's takings. History lives in
  // Records, which is one tap away. Not role-dependent: an admin wanting the
  // day's focus is the same want as a staff member's.
  const recent = useMemo(
    () => recentSales(sortedBatches.filter((b) => isToday(b.createdAt)), 3),
    [sortedBatches],
  );

  // Collected vs owed over the last 7 days — a weekly cash pulse, not all-time.
  const split7 = useMemo(() => {
    const d = new Date();
    const cutoff = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6).getTime();
    let collected = 0;
    let owed = 0;
    for (const b of sortedBatches) {
      if (parseDate(b.createdAt).getTime() >= cutoff) {
        collected += b.totalPaid || 0;
        owed += b.totalBalance || 0;
      }
    }
    const total = collected + owed;
    return { collected, owed, total, pct: total > 0 ? Math.round((collected / total) * 100) : 0 };
  }, [sortedBatches]);

  const todayRev = days7[days7.length - 1]?.value ?? 0;
  const yesterdayRev = days7[days7.length - 2]?.value ?? 0;
  // Always show a "vs yesterday" read; fall back gracefully when yesterday was ₦0.
  const delta = (() => {
    if (yesterdayRev > 0) {
      const pct = Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 100);
      const up = pct >= 0;
      return { tone: up ? ('up' as const) : ('down' as const), text: `${up ? '▲' : '▼'} ${Math.abs(pct)}% vs yesterday` };
    }
    if (todayRev > 0) return { tone: 'up' as const, text: '▲ up from yesterday' };
    return { tone: 'flat' as const, text: '— vs yesterday' };
  })();

  const reduceMotion = useReducedMotion();
  const enter = (delay: number) => (reduceMotion ? undefined : FadeInDown.duration(400).delay(delay));

  const hour = now.getHours();
  const greetingBase = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.displayName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `${greetingBase}, ${firstName}` : greetingBase;
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const nudge =
    ready.length > 0
      ? { text: `${ready.length} job${ready.length !== 1 ? 's' : ''} ready to dispatch`, meta: STATUS_META.Paid }
      : owing.length > 0
        ? { text: `${owing.length} client${owing.length !== 1 ? 's' : ''} owing`, meta: STATUS_META.Partial }
        : { text: 'All caught up — nice work', meta: STATUS_META.Paid };

  if (loading) {
    return (
      <PageContainer>
        <View style={styles.screen}>
          <LoadingSkeleton height={40} borderRadius={10} style={{ width: '60%' }} />
          <LoadingSkeleton height={190} borderRadius={20} />
          <LoadingSkeleton height={88} borderRadius={16} />
          <LoadingSkeleton height={150} borderRadius={20} />
          <LoadingSkeleton height={150} borderRadius={20} />
        </View>
      </PageContainer>
    );
  }

  return (
    <PageContainer refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.screen}>
        {/* Header — personal greeting + a live nudge at what needs you next. */}
        <Animated.View entering={enter(0)} style={styles.headerRow}>
          <View style={styles.header}>
            <ThemedText type="smallBold" themeColor="onSurfaceVariant" style={styles.dateText}>{dateLabel}</ThemedText>
            <ThemedText type="subtitle" style={styles.greeting} numberOfLines={1}>{greeting}</ThemedText>
            <View style={[styles.nudge, { backgroundColor: nudge.meta.bg }]}>
              <View style={[styles.nudgeDot, { backgroundColor: nudge.meta.color }]} />
              <ThemedText type="small" style={{ color: nudge.meta.color, fontWeight: '700', fontSize: 12 }}>{nudge.text}</ThemedText>
            </View>
          </View>
          <Pressable
            onPress={() => DeviceEventEmitter.emit(OPEN_MORE_EVENT)}
            accessibilityLabel="Open account menu"
            hitSlop={8}
          >
            <UserAvatar name={user?.displayName} email={user?.email} size={40} />
          </Pressable>
        </Animated.View>

        {/* Only when something is actually wrong. Renders nothing while the
            snapshots are still arriving, so it cannot shift the layout. */}
        <LedgerIntegrityBanner integrity={integrity} theme={theme} reduceMotion={reduceMotion} />

        {/* Money hero — today's revenue with a 7-day sparkline + vs-yesterday delta,
            and a weekly collected/owed pulse. Filled brand card anchors the screen. */}
        <Animated.View entering={enter(60)}>
          <Surface elevation={2} style={[styles.hero, { backgroundColor: theme.primary }]}>
            <View style={styles.heroTop}>
              <ThemedText type="smallBold" style={[styles.eyebrow, { color: withAlpha(theme.onPrimary, 0.75) }]}>Revenue · today</ThemedText>
              <View style={[styles.heroChip, { backgroundColor: withAlpha(theme.onPrimary, 0.16) }]}>
                <SymbolView name={{ ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' }} size={16} tintColor={theme.onPrimary} />
              </View>
            </View>

            <View style={styles.valRow}>
              <ThemedText style={[styles.heroValue, { color: theme.onPrimary }]}>{formatCurrency(todayRev)}</ThemedText>
              <View style={[styles.delta, { backgroundColor: withAlpha(theme.onPrimary, 0.14) }]}>
                <ThemedText
                  type="small"
                  style={{
                    color: delta.tone === 'up' ? STATUS_META.Paid.bg : delta.tone === 'down' ? STATUS_META.Unpaid.bg : withAlpha(theme.onPrimary, 0.8),
                    fontWeight: '800',
                    fontSize: 11,
                  }}
                >
                  {delta.text}
                </ThemedText>
              </View>
            </View>

            {/* 7-day revenue trend */}
            <View style={styles.spark}>
              <Sparkline values={days7.map((d) => d.value)} color={STATUS_META.Paid.bg} endColor={theme.onPrimary} height={44} />
            </View>
            <View style={styles.sparkLabels}>
              <ThemedText type="small" style={[styles.sparkLabel, { color: withAlpha(theme.onPrimary, 0.55) }]}>{days7[0]?.label ?? ''}</ThemedText>
              <ThemedText type="small" style={[styles.sparkLabel, { color: withAlpha(theme.onPrimary, 0.55) }]}>7-day revenue</ThemedText>
              <ThemedText type="small" style={[styles.sparkLabel, { color: withAlpha(theme.onPrimary, 0.55) }]}>Today</ThemedText>
            </View>

            {/* Collected vs owed — last 7 days */}
            <View style={styles.heroSplit}>
              <View style={[styles.splitTrack, { backgroundColor: withAlpha(theme.onPrimary, 0.18) }]}>
                {split7.collected > 0 ? (
                  <View style={{ flex: split7.collected, backgroundColor: STATUS_META.Paid.bg }} />
                ) : null}
                {split7.owed > 0 ? (
                  <View style={{ flex: split7.owed, backgroundColor: STATUS_META.Unpaid.bg, marginLeft: 2 }} />
                ) : null}
              </View>
              <View style={styles.splitLabels}>
                <View style={styles.splitLabel}>
                  <View style={[styles.dot, { backgroundColor: STATUS_META.Paid.bg }]} />
                  <ThemedText type="small" style={{ color: withAlpha(theme.onPrimary, 0.75) }}>Collected </ThemedText>
                  <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>{compactMoney(split7.collected)}</ThemedText>
                  <ThemedText type="small" style={{ color: withAlpha(theme.onPrimary, 0.6) }}> · {split7.pct}%</ThemedText>
                </View>
                <View style={styles.splitLabel}>
                  <View style={[styles.dot, { backgroundColor: STATUS_META.Unpaid.bg }]} />
                  <ThemedText type="small" style={{ color: withAlpha(theme.onPrimary, 0.75) }}>Owed </ThemedText>
                  <ThemedText type="smallBold" style={{ color: split7.owed > 0 ? STATUS_META.Unpaid.bg : theme.onPrimary }}>{compactMoney(split7.owed)}</ThemedText>
                </View>
              </View>
            </View>

            {/* Log Expense — the one action not already on the bottom tab bar. */}
            <Pressable
              onPress={() => router.push('/expenses')}
              style={({ pressed }) => [styles.heroAction, { borderTopColor: withAlpha(theme.onPrimary, 0.18) }, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Log an expense"
            >
              <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={16} tintColor={theme.onPrimary} />
              <ThemedText type="small" style={{ color: theme.onPrimary, fontWeight: '600', flex: 1 }}>Log Expense</ThemedText>
              <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={withAlpha(theme.onPrimary, 0.6)} />
            </Pressable>
          </Surface>
        </Animated.View>

        {/* Today's activity — sales & jobs as their own tiles (revenue is the hero). */}
        <Animated.View entering={enter(120)}>
          <Surface elevation={1} style={[styles.todayCard, { backgroundColor: theme.surface }]}>
            <TodayStat label="Sales today" value={String(metrics.todaySales)} />
            <View style={[styles.vDivider, { backgroundColor: theme.outlineVariant }]} />
            <TodayStat label="Jobs today" value={String(metrics.todayJobs)} />
          </Surface>
        </Animated.View>

        {/* Recent activity */}
        <Animated.View entering={enter(180)}>
          <Surface elevation={1} style={[styles.card, { backgroundColor: theme.surface }]}>
            <SectionHeader title="Recent" actionLabel="Records" onPress={() => router.push('/records')} theme={theme} />
            {recent.length === 0 ? (
              <ThemedText type="small" themeColor="onSurfaceVariant">No sales yet today.</ThemedText>
            ) : (
              <View>
                {recent.map((b, i) => (
                  <RecentRow key={b.id} batch={b} showDivider={i > 0} theme={theme} onPress={() => router.push(`/transaction/${b.id}`)} />
                ))}
              </View>
            )}
          </Surface>
        </Animated.View>

        {/* Production pipeline — a mini distribution bar over the stage counts. */}
        <Animated.View entering={enter(240)}>
          <Surface elevation={1} style={[styles.card, { backgroundColor: theme.surface }]}>
            <SectionHeader title="Production" actionLabel="Board" onPress={() => router.push('/board')} theme={theme} />
            <View style={[styles.prodBar, { backgroundColor: withAlpha(theme.onSurface, 0.06) }]}>
              {stages.map((s) => (s.count > 0 ? (
                <View key={s.stage} style={{ flex: s.count, backgroundColor: STAGE_META[s.stage] }} />
              ) : null))}
            </View>
            <Pressable style={styles.stageRow} onPress={() => router.push('/board')}>
              {stages.map((s) => (
                <View key={s.stage} style={styles.stageItem}>
                  <View style={[styles.stageCount, { backgroundColor: withAlpha(STAGE_META[s.stage], 0.14) }]}>
                    <ThemedText style={[styles.stageNum, { color: STAGE_META[s.stage] }]}>{s.count}</ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.stageLabel} numberOfLines={1}>{s.stage}</ThemedText>
                </View>
              ))}
            </Pressable>
          </Surface>
        </Animated.View>

        {/* Needs attention */}
        <Animated.View entering={enter(300)}>
          <Surface elevation={1} style={[styles.card, { backgroundColor: theme.surface }]}>
            <SectionHeader title="Needs attention" theme={theme} />
          {ready.length === 0 && owing.length === 0 ? (
            <View style={styles.clearState}>
              <SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} size={26} tintColor={STATUS_META.Paid.color} />
              <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginTop: 6 }}>All clear — nothing needs you right now.</ThemedText>
            </View>
          ) : (
            <View style={{ gap: Spacing.three }}>
              <AttnBlock
                title="Ready to dispatch"
                count={ready.length}
                accent={STATUS_META.Paid.color}
                theme={theme}
                rows={ready.slice(0, 2).map((b: SalesBatch) => ({ key: b.id, left: b.clientName || 'Unknown', right: formatCurrency(b.totalAmount), onPress: () => router.push(`/transaction/${b.id}`) }))}
                emptyText="None waiting"
              />
              <View style={[styles.hDivider, { backgroundColor: theme.outlineVariant }]} />
              <AttnBlock
                title="Clients owing"
                count={owing.length}
                accent={STATUS_META.Unpaid.color}
                theme={theme}
                rows={owing.slice(0, 3).map((c) => ({ key: c.clientName, left: c.clientName, right: formatCurrency(c.balance), rightColor: STATUS_META.Unpaid.color }))}
                emptyText="Everyone's settled"
              />
            </View>
          )}
          </Surface>
        </Animated.View>

        {/* The clean confirmation lives here rather than at the top: it must be
            present and must state its window, but it should not own the top of
            a phone screen to say nothing is wrong. */}
        <LedgerIntegrityNote integrity={integrity} theme={theme} />
      </View>
    </PageContainer>
  );
}

function TodayStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.todayItem}>
      <ThemedText type="defaultSemiBold" style={styles.todayValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</ThemedText>
      <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.todayLabel} numberOfLines={1}>{label}</ThemedText>
    </View>
  );
}

function RecentRow({ batch, showDivider, theme, onPress }: { batch: SalesBatch; showDivider: boolean; theme: any; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.recentRow, showDivider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.outlineVariant }, pressed && { opacity: 0.6 }]}
    >
      <UserAvatar name={batch.clientName} size={34} />
      <View style={{ flex: 1 }}>
        <ThemedText type="small" numberOfLines={1} style={{ fontWeight: '700' }}>{batch.clientName || 'Unknown'}</ThemedText>
        <ThemedText type="small" themeColor="onSurfaceVariant" numberOfLines={1} style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>
          {batch.receiptId || batch.id} · {batch.records.length} item{batch.records.length !== 1 ? 's' : ''}
        </ThemedText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <ThemedText type="smallBold" style={{ fontVariant: ['tabular-nums'] }}>{formatCurrency(batch.totalAmount)}</ThemedText>
        <StatusChip status={batch.status} />
      </View>
    </Pressable>
  );
}

function SectionHeader({ title, actionLabel, onPress, theme }: { title: string; actionLabel?: string; onPress?: () => void; theme: any }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="defaultSemiBold">{title}</ThemedText>
      {actionLabel && onPress ? (
        <Pressable onPress={onPress} hitSlop={8}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>{actionLabel} →</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

interface AttnRow {
  key: string;
  left: string;
  right: string;
  rightColor?: string;
  onPress?: () => void;
}

function AttnBlock({ title, count, accent, rows, emptyText, theme }: { title: string; count: number; accent: string; rows: AttnRow[]; emptyText: string; theme: any }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.attnHead}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <View style={[styles.countBadge, { backgroundColor: withAlpha(accent, 0.14) }]}>
          <ThemedText type="small" style={{ color: accent, fontWeight: '800' }}>{count}</ThemedText>
        </View>
      </View>
      {rows.length === 0 ? (
        <ThemedText type="small" themeColor="onSurfaceVariant">{emptyText}</ThemedText>
      ) : (
        rows.map((r) => {
          const content = (
            <View style={styles.attnRow}>
              <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{r.left}</ThemedText>
              <ThemedText type="small" style={{ fontWeight: '700', color: r.rightColor ?? theme.onSurface, fontVariant: ['tabular-nums'] }}>{r.right}</ThemedText>
            </View>
          );
          return r.onPress ? (
            <Pressable key={r.key} onPress={r.onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>{content}</Pressable>
          ) : (
            <View key={r.key}>{content}</View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  header: {
    flex: 1,
    gap: Spacing.one,
  },
  dateText: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
  },
  greeting: {
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
  },
  nudgeDot: { width: 6, height: 6, borderRadius: 3 },

  hero: {
    borderRadius: 20,
    padding: Spacing.four,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heroChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
  },
  heroValue: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  valRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  delta: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginBottom: 5,
  },
  spark: {
    marginTop: Spacing.three,
  },
  sparkLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  sparkLabel: {
    fontSize: 10,
  },
  heroSplit: {
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  splitTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  splitLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  splitLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },

  todayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  todayItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  todayValue: {
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  todayLabel: {
    fontSize: 11,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  vDivider: { width: StyleSheet.hairlineWidth, height: '70%' },

  card: {
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: 9,
  },
  prodBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 5,
    overflow: 'hidden',
    gap: 2,
  },
  stageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stageItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  stageCount: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageNum: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  stageLabel: {
    fontSize: 10,
    textAlign: 'center',
    alignSelf: 'stretch',
  },

  clearState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
  },
  attnHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 4,
  },
  hDivider: { height: StyleSheet.hairlineWidth },

  heroAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
