import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Deal {
  id: string;
  client: string;
  value: number;
  stage: 'Lead' | 'Contacted' | 'Proposal' | 'Negotiation' | 'Won';
  company: string;
  owner: string;
  daysActive: number;
}

const INITIAL_DEALS: Deal[] = [
  { id: '1', client: 'John Doe', company: 'Acme Corp', value: 45000, stage: 'Lead', owner: 'Alice Smith', daysActive: 2 },
  { id: '2', client: 'Hank Scorpio', company: 'Globex Corp', value: 15000, stage: 'Contacted', owner: 'Bob Jones', daysActive: 1 },
  { id: '3', client: 'Albert Wesker', company: 'Umbrella Corp', value: 95000, stage: 'Contacted', owner: 'Alice Smith', daysActive: 4 },
  { id: '4', client: 'Lex Luthor', company: 'LexCorp', value: 85000, stage: 'Proposal', owner: 'Charlie Brown', daysActive: 5 },
  { id: '5', client: 'Bruce Wayne', company: 'Wayne Ent.', value: 120000, stage: 'Negotiation', owner: 'Bob Jones', daysActive: 8 },
  { id: '6', client: 'Pepper Potts', company: 'Stark Industries', value: 250000, stage: 'Won', owner: 'Charlie Brown', daysActive: 12 },
];

const STAGES = ['Lead', 'Contacted', 'Proposal', 'Negotiation', 'Won'] as const;

type StageType = typeof STAGES[number];

export default function BoardScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const [deals, setDeals] = useState<Deal[]>(INITIAL_DEALS);
  const [selectedMobileStage, setSelectedMobileStage] = useState<StageType>('Lead');
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  // Helper calculation
  const getStageDeals = (stage: StageType) => deals.filter((d) => d.stage === stage);
  const getStageTotal = (stage: StageType) =>
    getStageDeals(stage).reduce((sum, d) => sum + d.value, 0);

  const getPipelineTotal = () => deals.reduce((sum, d) => sum + d.value, 0);
  const getWonTotal = () => deals.filter((d) => d.stage === 'Won').reduce((sum, d) => sum + d.value, 0);

  const handleAdvanceStage = (dealId: string) => {
    setDeals((prevDeals) =>
      prevDeals.map((deal) => {
        if (deal.id !== dealId) return deal;
        const currentIdx = STAGES.indexOf(deal.stage);
        if (currentIdx < STAGES.length - 1) {
          const nextStage = STAGES[currentIdx + 1];
          // If the deal was the active deal, update the modal preview as well
          const updatedDeal = { ...deal, stage: nextStage };
          if (activeDeal && activeDeal.id === dealId) {
            setActiveDeal(updatedDeal);
          }
          return updatedDeal;
        }
        return deal;
      })
    );
  };

  const handleDemoteStage = (dealId: string) => {
    setDeals((prevDeals) =>
      prevDeals.map((deal) => {
        if (deal.id !== dealId) return deal;
        const currentIdx = STAGES.indexOf(deal.stage);
        if (currentIdx > 0) {
          const prevStage = STAGES[currentIdx - 1];
          const updatedDeal = { ...deal, stage: prevStage };
          if (activeDeal && activeDeal.id === dealId) {
            setActiveDeal(updatedDeal);
          }
          return updatedDeal;
        }
        return deal;
      })
    );
  };

  const handleDeleteDeal = (dealId: string) => {
    setDeals((prevDeals) => prevDeals.filter((d) => d.id !== dealId));
    setActiveDeal(null);
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  const isWebLayout = Platform.OS === 'web';

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentInset={insets}
        contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
      >
        <ThemedView style={styles.container}>
        {/* Header Section */}
        <ThemedView style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>Kanban Sales Board</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Manage and track active sales deals through pipeline stages.
          </ThemedText>
        </ThemedView>

        {/* Dashboard Stats */}
        <View style={styles.dashboardStats}>
          <ThemedView type="backgroundElement" style={styles.statBox}>
            <ThemedText type="code" themeColor="textSecondary">Active Pipeline</ThemedText>
            <ThemedText type="smallBold" style={[styles.statValue, { color: theme.primary }]}>
              ₦{getPipelineTotal().toLocaleString()}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.statBox}>
            <ThemedText type="code" themeColor="textSecondary">Total Won</ThemedText>
            <ThemedText type="smallBold" style={[styles.statValue, { color: (theme.success || '#0A802F') }]}>
              ₦{getWonTotal().toLocaleString()}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.statBox}>
            <ThemedText type="code" themeColor="textSecondary">Deal Count</ThemedText>
            <ThemedText type="smallBold" style={styles.statValue}>
              {deals.length} Active
            </ThemedText>
          </ThemedView>
        </View>

        {/* Mobile Stage Selector */}
        {!isWebLayout && (
          <View style={styles.stageTabsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
              {STAGES.map((stage) => {
                const isActive = selectedMobileStage === stage;
                const count = getStageDeals(stage).length;
                return (
                  <Pressable
                    key={stage}
                    onPress={() => setSelectedMobileStage(stage)}
                      style={[
                        styles.stageTab,
                        {
                          backgroundColor: isActive ? theme.primary : theme.backgroundElement,
                          borderColor: theme.backgroundSelected,
                        }
                      ]}
                  >
                    <ThemedText type="smallBold" style={{ color: isActive ? '#ffffff' : theme.text }}>
                      {stage} ({count})
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Board Columns Grid */}
        <View style={isWebLayout ? styles.webBoardGrid : styles.mobileBoardGrid}>
          {isWebLayout ? (
            STAGES.map((stage) => {
              const stageDeals = getStageDeals(stage);
              return (
                <ThemedView key={stage} type="backgroundElement" style={styles.boardColumn}>
                  {/* Column Header */}
                  <View style={styles.columnHeader}>
                    <ThemedText type="smallBold" style={styles.columnTitle}>{stage}</ThemedText>
                    <ThemedView type="backgroundSelected" style={styles.countBadge}>
                      <ThemedText type="code">{stageDeals.length}</ThemedText>
                    </ThemedView>
                  </View>
                  <ThemedText type="code" themeColor="textSecondary" style={styles.columnTotal}>
                    ₦{getStageTotal(stage).toLocaleString()}
                  </ThemedText>

                  {/* Cards */}
                  <ScrollView style={styles.columnCardsScroll} contentContainerStyle={styles.columnCardsContainer}>
                    {stageDeals.map((deal) => (
                      <Pressable
                        key={deal.id}
                        onPress={() => setActiveDeal(deal)}
                        style={({ pressed }) => [
                          styles.dealCard,
                          { backgroundColor: theme.background, borderColor: theme.backgroundSelected },
                          pressed && styles.pressed
                        ]}
                      >
                        <ThemedText type="smallBold">{deal.company}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">{deal.client}</ThemedText>
                        
                        <View style={styles.cardFooter}>
                          <ThemedText type="smallBold" style={{ color: theme.primary }}>
                            ₦{deal.value.toLocaleString()}
                          </ThemedText>
                          <ThemedText type="code" themeColor="textSecondary">
                            {deal.daysActive}d
                          </ThemedText>
                        </View>
                      </Pressable>
                    ))}
                    {stageDeals.length === 0 && (
                      <View style={styles.emptyColumn}>
                        <ThemedText type="code" themeColor="textSecondary">No Deals</ThemedText>
                      </View>
                    )}
                  </ScrollView>
                </ThemedView>
              );
            })
          ) : (
            // Mobile active column layout
            <View style={styles.mobileColumnContainer}>
              <View style={styles.mobileColumnHeader}>
                <ThemedText type="smallBold" style={{ fontSize: 18 }}>
                  {selectedMobileStage} Deals
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  Total: ₦{getStageTotal(selectedMobileStage).toLocaleString()}
                </ThemedText>
              </View>

              {getStageDeals(selectedMobileStage).length === 0 ? (
                <View style={[styles.emptyColumn, { padding: 40, marginTop: 20 }]}>
                  <ThemedText type="subtitle" themeColor="textSecondary">No Deals</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 8 }}>Nothing in this stage yet.</ThemedText>
                </View>
              ) : getStageDeals(selectedMobileStage).map((deal) => (
                <Pressable
                  key={deal.id}
                  onPress={() => setActiveDeal(deal)}
                  style={({ pressed }) => [
                    styles.dealCard,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
                    pressed && styles.pressed
                  ]}
                >
                  <View style={styles.mobileCardHeader}>
                    <View>
                      <ThemedText type="smallBold" style={{ fontSize: 16 }}>{deal.company}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{deal.client}</ThemedText>
                    </View>
                    <ThemedText type="smallBold" style={{ color: theme.primary, fontSize: 16 }}>
                      ₦{deal.value.toLocaleString()}
                    </ThemedText>
                  </View>

                  <View style={styles.mobileCardFooter}>
                    <View style={styles.ownerBadge}>
                      <SymbolView
                        name={{ ios: 'person.fill', android: 'person', web: 'person' }}
                        size={10}
                        tintColor={theme.textSecondary}
                      />
                      <ThemedText type="code" themeColor="textSecondary" style={{ marginLeft: 4 }}>
                        {deal.owner}
                      </ThemedText>
                    </View>
                    <ThemedText type="code" themeColor="textSecondary">
                      Active for {deal.daysActive} days
                    </ThemedText>
                  </View>
                </Pressable>
              ))}

              {getStageDeals(selectedMobileStage).length === 0 && (
                <ThemedView type="backgroundElement" style={styles.emptyState}>
                  <SymbolView
                    name={{ ios: 'tray.fill', android: 'inbox', web: 'inbox' }}
                    size={36}
                    tintColor={theme.textSecondary}
                  />
                  <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 8 }}>
                    No active deals in this stage.
                  </ThemedText>
                </ThemedView>
              )}
            </View>
          )}
        </View>

        {/* Card Detail & Interaction Modal / Overlay */}
        {activeDeal && (
          <View style={styles.modalOverlay}>
            <ThemedView type="backgroundElement" style={[styles.modalCard, { borderColor: theme.backgroundSelected }]}>
              <View style={styles.modalHeader}>
                <View>
                  <ThemedText type="subtitle" style={styles.modalTitle}>{activeDeal.company}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.modalSubtitle}>
                    Contact: {activeDeal.client}
                  </ThemedText>
                </View>
                <Pressable onPress={() => setActiveDeal(null)} style={styles.closeButton}>
                  <SymbolView
                    name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                    size={24}
                    tintColor={theme.textSecondary}
                  />
                </Pressable>
              </View>

              <View style={[styles.modalInfoPanel, { backgroundColor: theme.background }]}>
                <View style={styles.infoRow}>
                  <ThemedText type="small" themeColor="textSecondary">Current Stage</ThemedText>
                  <View style={[styles.modalStageBadge, { backgroundColor: theme.primary + '1A' }]}>
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>{activeDeal.stage}</ThemedText>
                  </View>
                </View>
                <View style={styles.infoRow}>
                  <ThemedText type="small" themeColor="textSecondary">Deal Value</ThemedText>
                  <ThemedText type="smallBold" style={{ fontSize: 18, color: theme.primary }}>
                    ₦{activeDeal.value.toLocaleString()}
                  </ThemedText>
                </View>
                <View style={styles.infoRow}>
                  <ThemedText type="small" themeColor="textSecondary">Lead Owner</ThemedText>
                  <ThemedText type="smallBold">{activeDeal.owner}</ThemedText>
                </View>
                <View style={styles.infoRow}>
                  <ThemedText type="small" themeColor="textSecondary">Age</ThemedText>
                  <ThemedText type="smallBold">{activeDeal.daysActive} days in pipeline</ThemedText>
                </View>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionButton,
                    { backgroundColor: theme.background, borderColor: theme.backgroundSelected },
                    pressed && styles.pressed,
                    STAGES.indexOf(activeDeal.stage) === 0 && styles.disabledButton
                  ]}
                  onPress={() => handleDemoteStage(activeDeal.id)}
                  disabled={STAGES.indexOf(activeDeal.stage) === 0}
                >
                  <SymbolView
                    name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }}
                    size={16}
                    tintColor={STAGES.indexOf(activeDeal.stage) === 0 ? theme.backgroundSelected : theme.text}
                  />
                  <ThemedText type="smallBold" style={{ marginLeft: 8, color: STAGES.indexOf(activeDeal.stage) === 0 ? theme.backgroundSelected : theme.text }}>
                    Move Back
                  </ThemedText>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionButton,
                    { backgroundColor: theme.primary },
                    pressed && styles.pressed,
                    STAGES.indexOf(activeDeal.stage) === STAGES.length - 1 && styles.disabledButton
                  ]}
                  onPress={() => handleAdvanceStage(activeDeal.id)}
                  disabled={STAGES.indexOf(activeDeal.stage) === STAGES.length - 1}
                >
                  <ThemedText type="smallBold" style={{ color: '#ffffff', marginRight: 8 }}>
                    Advance Stage
                  </ThemedText>
                  <SymbolView
                    name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
                    size={16}
                    tintColor="#ffffff"
                  />
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
                onPress={() => handleDeleteDeal(activeDeal.id)}
              >
                <SymbolView
                  name={{ ios: 'trash.fill', android: 'delete', web: 'delete' }}
                  size={14}
                  tintColor={theme.error || '#FF3B30'}
                />
                <ThemedText type="smallBold" style={{ color: theme.error || '#FF3B30', marginLeft: 6 }}>
                  Archive / Delete Deal
                </ThemedText>
              </Pressable>
            </ThemedView>
          </View>
        )}
      </ThemedView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
    width: '100%',
  },
  header: {
    gap: Spacing.one,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
  dashboardStats: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  statBox: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  stageTabsContainer: {
    height: 48,
    marginVertical: Spacing.one,
  },
  tabsScroll: {
    flexDirection: 'row',
  },
  stageTab: {
    paddingHorizontal: Spacing.three,
    height: 38,
    borderWidth: 1,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.two,
  },
  webBoardGrid: {
    flexDirection: 'row',
    gap: Spacing.three,
    minHeight: 450,
  },
  mobileBoardGrid: {
    gap: Spacing.three,
  },
  boardColumn: {
    flex: 1,
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  columnTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  countBadge: {
    borderRadius: 12,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  columnTotal: {
    fontSize: 12,
  },
  columnCardsScroll: {
    flex: 1,
  },
  columnCardsContainer: {
    gap: Spacing.two,
  },
  dealCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  emptyColumn: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileColumnContainer: {
    gap: Spacing.two,
  },
  mobileColumnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  mobileCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mobileCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  ownerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyState: {
    borderRadius: Spacing.three,
    padding: Spacing.five,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 180,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 450,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.four,
    borderWidth: 1,
    boxShadow: '0px 6px 15px rgba(0,0,0,0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modalTitle: {
    fontWeight: '700',
    fontSize: 22,
  },
  modalSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  closeButton: {
    padding: 2,
  },
  modalInfoPanel: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalStageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: Spacing.two,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.4,
  },
  deleteButton: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
