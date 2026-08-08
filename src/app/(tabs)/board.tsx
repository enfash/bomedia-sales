import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PRODUCTION_STAGES, type ProductionStage, type SalesBatch } from '@/components/records/types';
import { BottomTabInset, MaxContentWidth, Spacing, WebContentMaxWidth, WebContentPaddingH } from '@/constants/theme';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { useRecords } from '@/hooks/use-records';
import { useTheme } from '@/hooks/use-theme';
import { describeWriteError } from '@/utils/errors';
import { useAuth } from '@/context/auth-context';
import { logActivity } from '@/services/activity';
import { updateProductionStage } from '@/services/sales-repository';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { STATUS_META } from '@/utils/payment-status';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Colour accent per production stage (semantic, brand-aligned). */
const STAGE_ACCENT: Record<ProductionStage, string> = {
  Queued: '#767683',
  Printing: '#2e388d',
  Finishing: '#b26a00',
  Ready: '#1c7d4d',
  Delivered: '#454651',
};

const isRush = (job: SalesBatch) =>
  job.records.some((r) => r.turnaroundTime === 'Rush' || r.turnaroundTime === 'Same Day');

const jobSummary = (job: SalesBatch) => {
  const first = job.records[0];
  if (!first) return 'No items';
  return job.records.length > 1 ? `${first.material} +${job.records.length - 1} more` : first.material;
};

export default function BoardScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = { ...safeAreaInsets, bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three };
  const theme = useTheme();
  const router = useRouter();
  const { actor } = useAuth();

  const { sortedBatches: jobs, loading, refresh } = useRecords(theme);
  const { refreshing, onRefresh } = usePullRefresh([refresh]);

  const [selectedStage, setSelectedStage] = useState<ProductionStage>('Queued');
  const [activeJob, setActiveJob] = useState<SalesBatch | null>(null);

  const stageJobs = (stage: ProductionStage) => jobs.filter((j) => j.productionStage === stage);
  const stageTotal = (stage: ProductionStage) => stageJobs(stage).reduce((s, j) => s + (j.totalAmount || 0), 0);

  const stats = useMemo(() => {
    const inProduction = jobs.filter((j) => j.productionStage !== 'Delivered');
    const ready = jobs.filter((j) => j.productionStage === 'Ready');
    return {
      active: inProduction.length,
      activeValue: inProduction.reduce((s, j) => s + (j.totalAmount || 0), 0),
      ready: ready.length,
    };
  }, [jobs]);

  const moveStage = async (job: SalesBatch, dir: 1 | -1) => {
    const idx = PRODUCTION_STAGES.indexOf(job.productionStage);
    const next = PRODUCTION_STAGES[idx + dir];
    if (!next) return;
    setActiveJob({ ...job, productionStage: next });

    // RESOLVES OPTIMISTICALLY, unlike every money write. A stage is not money:
    // a wrong one is visible on the board and fixed with one tap, so making the
    // operator wait ten seconds for a server to agree costs more than the
    // mistake it prevents. It is not journalled either — a lost stage move is
    // re-doable, and putting it through the outbox would put every write in the
    // app behind machinery built for payments.
    updateProductionStage(job, next)
      .then(() => {
        logActivity({
          type: 'production_moved',
          actor,
          message: `${actor.name} moved ${job.clientName || 'a job'} to ${next}`,
          meta: { batchId: job.id, stage: next },
        });
      })
      .catch((error) => {
        // The board re-renders from the subscription, so a refused move snaps
        // back on its own. Say so rather than leaving it unexplained.
        const message = describeWriteError(error, 'move this job');
        Alert.alert(message.title, message.body);
      });
  };

  const isWeb = Platform.OS === 'web';

  const contentPlatformStyle = Platform.select({
    android: { paddingTop: insets.top, paddingBottom: insets.bottom },
    web: { paddingTop: Spacing.six, paddingBottom: Spacing.four },
    default: { paddingBottom: insets.bottom },
  });

  const renderHeader = () => (
    <View style={[styles.headerWrap, isWeb && styles.webBlock]}>
      <ThemedView style={styles.header}>
        <ThemedText type="subtitle" style={styles.title}>Production Board</ThemedText>
        <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
          Track large-format jobs through the 10ft machine, from queue to delivery.
        </ThemedText>
      </ThemedView>

      <View style={styles.statsRow}>
        <ThemedView type="surface" style={styles.statBox}>
          <ThemedText type="code" themeColor="onSurfaceVariant">In Production</ThemedText>
          <ThemedText type="smallBold" style={[styles.statValue, { color: theme.primary }]}>{stats.active} jobs</ThemedText>
        </ThemedView>
        <ThemedView type="surface" style={styles.statBox}>
          <ThemedText type="code" themeColor="onSurfaceVariant">Ready</ThemedText>
          <ThemedText type="smallBold" style={[styles.statValue, { color: STAGE_ACCENT.Ready }]}>{stats.ready} jobs</ThemedText>
        </ThemedView>
        <ThemedView type="surface" style={styles.statBox}>
          <ThemedText type="code" themeColor="onSurfaceVariant">Pipeline Value</ThemedText>
          <ThemedText type="smallBold" style={styles.statValue}>{formatCurrency(stats.activeValue)}</ThemedText>
        </ThemedView>
      </View>

      {!isWeb && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stageTabs}>
            {PRODUCTION_STAGES.map((stage) => {
              const active = selectedStage === stage;
              return (
                <Pressable
                  key={stage}
                  onPress={() => setSelectedStage(stage)}
                  style={[styles.stageTab, { backgroundColor: active ? theme.primary : theme.surface, borderColor: theme.surfaceVariant }]}
                >
                  <ThemedText type="smallBold" style={{ color: active ? theme.onPrimary : theme.onSurface }}>
                    {stage} ({stageJobs(stage).length})
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.mobileColHead}>
            <ThemedText type="smallBold" style={{ fontSize: 18 }}>{selectedStage}</ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>{formatCurrency(stageTotal(selectedStage))}</ThemedText>
          </View>
        </>
      )}
    </View>
  );

  const renderJobCard = (job: SalesBatch, compact?: boolean) => (
    <Pressable key={job.id} onPress={() => setActiveJob(job)}>
      <ThemedView type="surface" style={[styles.jobCard, { borderColor: theme.surfaceVariant }]}>
        <View style={[styles.accent, { backgroundColor: STAGE_ACCENT[job.productionStage] }]} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.rowBetween}>
            <ThemedText type="smallBold" numberOfLines={1} style={{ flex: 1 }}>{job.clientName || 'Unknown'}</ThemedText>
            {isRush(job) && (
              <View style={[styles.rush, { backgroundColor: STATUS_META.Partial.bg }]}>
                <ThemedText type="code" style={{ color: STATUS_META.Partial.color, fontWeight: '700' }}>RUSH</ThemedText>
              </View>
            )}
          </View>
          <ThemedText type="small" themeColor="onSurfaceVariant" numberOfLines={1}>{jobSummary(job)}</ThemedText>
          <View style={styles.rowBetween}>
            <ThemedText type="code" themeColor="onSurfaceVariant">{formatDate(job.createdAt)}</ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>{formatCurrency(job.totalAmount || 0)}</ThemedText>
          </View>
          {!compact && (
            <ThemedText type="code" themeColor="onSurfaceVariant">
              {job.records.length} item{job.records.length !== 1 ? 's' : ''}
            </ThemedText>
          )}
        </View>
      </ThemedView>
    </Pressable>
  );

  const renderDetail = () => {
    if (!activeJob) return null;
    const idx = PRODUCTION_STAGES.indexOf(activeJob.productionStage);
    return (
      <View style={styles.modalOverlay}>
        <ThemedView type="surface" style={[styles.modalCard, { borderColor: theme.surfaceVariant }]}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <ThemedText type="subtitle" style={{ fontWeight: '700' }}>{activeJob.clientName || 'Unknown'}</ThemedText>
              <ThemedText type="small" themeColor="onSurfaceVariant">{jobSummary(activeJob)}</ThemedText>
            </View>
            <Pressable onPress={() => setActiveJob(null)}>
              <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} size={24} tintColor={theme.onSurfaceVariant} />
            </Pressable>
          </View>

          <View style={[styles.modalPanel, { backgroundColor: theme.background }]}>
            <View style={styles.rowBetween}>
              <ThemedText type="small" themeColor="onSurfaceVariant">Current stage</ThemedText>
              <View style={[styles.stageBadge, { backgroundColor: STAGE_ACCENT[activeJob.productionStage] + '1A' }]}>
                <ThemedText type="smallBold" style={{ color: STAGE_ACCENT[activeJob.productionStage] }}>{activeJob.productionStage}</ThemedText>
              </View>
            </View>
            <View style={styles.rowBetween}>
              <ThemedText type="small" themeColor="onSurfaceVariant">Order value</ThemedText>
              <ThemedText type="smallBold" style={{ fontSize: 18, color: theme.primary }}>{formatCurrency(activeJob.totalAmount || 0)}</ThemedText>
            </View>
            <View style={styles.rowBetween}>
              <ThemedText type="small" themeColor="onSurfaceVariant">Items</ThemedText>
              <ThemedText type="smallBold">{activeJob.records.length}</ThemedText>
            </View>
          </View>

          <View style={styles.modalActions}>
            <Pressable
              style={({ pressed }) => [styles.moveBtn, { backgroundColor: theme.background, borderColor: theme.surfaceVariant }, pressed && styles.pressed, idx === 0 && styles.disabled]}
              onPress={() => moveStage(activeJob, -1)}
              disabled={idx === 0}
            >
              <SymbolView name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} size={16} tintColor={idx === 0 ? theme.surfaceVariant : theme.onSurface} />
              <ThemedText type="smallBold" style={{ marginLeft: 8, color: idx === 0 ? theme.surfaceVariant : theme.onSurface }}>Back</ThemedText>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.moveBtn, { backgroundColor: theme.primary }, pressed && styles.pressed, idx === PRODUCTION_STAGES.length - 1 && styles.disabled]}
              onPress={() => moveStage(activeJob, 1)}
              disabled={idx === PRODUCTION_STAGES.length - 1}
            >
              <ThemedText type="smallBold" style={{ color: theme.onPrimary, marginRight: 8 }}>Advance</ThemedText>
              <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} size={16} tintColor={theme.onPrimary} />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.openBtn, pressed && styles.pressed]}
            onPress={() => { const id = activeJob.id; setActiveJob(null); router.push(`/transaction/${id}`); }}
          >
            <SymbolView name={{ ios: 'doc.text', android: 'description', web: 'description' }} size={15} tintColor={theme.primary} />
            <ThemedText type="smallBold" style={{ color: theme.primary, marginLeft: 6 }}>Open order details</ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    );
  };

  // ---- Web: full kanban grid ----
  if (isWeb) {
    return (
      <View style={[styles.main, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={[styles.centered, contentPlatformStyle]}>
          <View style={{ width: '100%' }}>
            {renderHeader()}
            <View style={[styles.gridWrap, isWeb && styles.webBlock]}>
              <View style={styles.grid}>
                {PRODUCTION_STAGES.map((stage) => {
                  const items = stageJobs(stage);
                  return (
                    <ThemedView key={stage} type="surface" style={styles.column}>
                      <View style={styles.rowBetween}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[styles.dot, { backgroundColor: STAGE_ACCENT[stage] }]} />
                          <ThemedText type="smallBold" style={styles.columnTitle}>{stage}</ThemedText>
                        </View>
                        <ThemedView type="surfaceVariant" style={styles.countBadge}><ThemedText type="code">{items.length}</ThemedText></ThemedView>
                      </View>
                      <ThemedText type="code" themeColor="onSurfaceVariant">{formatCurrency(stageTotal(stage))}</ThemedText>
                      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: Spacing.two }}>
                        {items.map((job) => renderJobCard(job, true))}
                        {items.length === 0 && (
                          <View style={styles.emptyColumn}><ThemedText type="code" themeColor="onSurfaceVariant">No jobs</ThemedText></View>
                        )}
                      </ScrollView>
                    </ThemedView>
                  );
                })}
              </View>
            </View>
          </View>
        </ScrollView>
        {renderDetail()}
      </View>
    );
  }

  // ---- Mobile: one stage at a time ----
  return (
    <View style={[styles.main, { backgroundColor: theme.background }]}>
      <FlatList
        data={stageJobs(selectedStage)}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader()}
        contentContainerStyle={contentPlatformStyle}
        refreshControl={
          Platform.OS !== 'web'
            ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
            : undefined
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: Spacing.four, paddingBottom: Spacing.three }}>
            {renderJobCard(item)}
          </View>
        )}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: Spacing.four }}>
            <ThemedView type="surface" style={styles.emptyState}>
              <SymbolView name={{ ios: 'tray', android: 'inbox', web: 'inbox' }} size={34} tintColor={theme.onSurfaceVariant} />
              <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginTop: 8 }}>
                {loading ? 'Loading jobs…' : `No jobs in ${selectedStage}.`}
              </ThemedText>
            </ThemedView>
          </View>
        }
      />
      {renderDetail()}
    </View>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1 },
  centered: { alignItems: 'center', width: '100%' },
  headerWrap: { gap: Spacing.four, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.two, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  // On web every page shares the same wide, centered content column.
  webBlock: { maxWidth: WebContentMaxWidth, paddingHorizontal: WebContentPaddingH },
  header: { gap: Spacing.one },
  title: { fontWeight: '700' },
  subtitle: { fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: Spacing.three },
  statBox: { flex: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  statValue: { fontSize: 18, fontWeight: '700' },
  stageTabs: { flexDirection: 'row' },
  stageTab: { paddingHorizontal: Spacing.three, height: 38, borderWidth: 1, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.two },
  mobileColHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jobCard: { flexDirection: 'row', gap: Spacing.three, borderRadius: 14, padding: Spacing.three, borderWidth: 1, overflow: 'hidden' },
  accent: { width: 4, borderRadius: 2, alignSelf: 'stretch' },
  rush: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  gridWrap: { paddingHorizontal: Spacing.four, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  grid: { flexDirection: 'row', gap: Spacing.three, minHeight: 460 },
  column: { flex: 1, borderRadius: Spacing.four, padding: Spacing.three, gap: Spacing.two },
  columnTitle: { fontSize: 15, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  countBadge: { borderRadius: 12, minWidth: 22, height: 22, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
  emptyColumn: { height: 100, justifyContent: 'center', alignItems: 'center' },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, justifyContent: 'center', alignItems: 'center', minHeight: 180 },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: Spacing.four },
  modalCard: { width: '100%', maxWidth: 450, borderRadius: Spacing.four, padding: Spacing.four, gap: Spacing.four, borderWidth: 1 },
  modalPanel: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  stageBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  modalActions: { flexDirection: 'row', gap: Spacing.two },
  moveBtn: { flex: 1, height: 44, borderWidth: 1, borderRadius: Spacing.two, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  openBtn: { height: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
});
