import React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function DashboardScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

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

  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentInset={insets}
        contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
      >
        <ThemedView style={styles.container}>
        
        {/* Top Header */}
        <ThemedView style={styles.header}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.dateText}>
            {todayDate}
          </ThemedText>
          <View style={styles.titleRow}>
            <ThemedText type="subtitle" style={styles.title}>Today at a glance</ThemedText>
            <View style={[styles.liveBadge, { backgroundColor: theme.error + '1A' }]}>
              <View style={[styles.liveDot, { backgroundColor: theme.error }]} />
              <ThemedText type="smallBold" style={[styles.liveText, { color: theme.error }]}>Live</ThemedText>
            </View>
          </View>
        </ThemedView>

        {/* Live Overview Row */}
        <ThemedView type="backgroundElement" style={styles.liveRowCard}>
          <View style={styles.liveItem}>
            <ThemedText type="small" themeColor="textSecondary">Sales</ThemedText>
            <ThemedText type="defaultSemiBold">12</ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
          <View style={styles.liveItem}>
            <ThemedText type="small" themeColor="textSecondary">Jobs</ThemedText>
            <ThemedText type="defaultSemiBold">8</ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
          <View style={styles.liveItem}>
            <ThemedText type="small" themeColor="textSecondary">Revenue</ThemedText>
            <ThemedText type="defaultSemiBold" style={{ color: theme.primary }}>₦45,000</ThemedText>
          </View>
        </ThemedView>

        {/* Big Card: Total Sales */}
        <ThemedView type="backgroundElement" style={styles.bigCard}>
          <View style={styles.bigCardHeader}>
            <View style={[styles.iconContainer, { backgroundColor: theme.primary + '1A' }]}>
              <SymbolView name={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }} size={24} tintColor={theme.primary} />
            </View>
            <ThemedText type="defaultSemiBold" themeColor="textSecondary">Total Sales</ThemedText>
          </View>
          <View style={styles.bigCardBody}>
            <ThemedText type="subtitle" style={styles.bigCardAmount}>₦1,250,000</ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.success }}>+15% from last month</ThemedText>
          </View>
        </ThemedView>

        {/* Small Cards Grid */}
        <View style={styles.gridContainer}>
          {/* Expenses */}
          <ThemedView type="backgroundElement" style={styles.smallCard}>
            <View style={[styles.smallIconContainer, { backgroundColor: theme.error + '1A' }]}>
              <SymbolView name={{ ios: 'arrow.down.right.circle.fill', android: 'trending_down', web: 'trending_down' }} size={20} tintColor={theme.error} />
            </View>
            <View style={styles.smallCardInfo}>
              <ThemedText type="small" themeColor="textSecondary">Expenses</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.smallCardValue}>₦12,500</ThemedText>
            </View>
          </ThemedView>

          {/* Net Profit */}
          <ThemedView type="backgroundElement" style={styles.smallCard}>
            <View style={[styles.smallIconContainer, { backgroundColor: theme.success + '1A' }]}>
              <SymbolView name={{ ios: 'banknote.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' }} size={20} tintColor={theme.success} />
            </View>
            <View style={styles.smallCardInfo}>
              <ThemedText type="small" themeColor="textSecondary">Net Profit</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.smallCardValue}>₦32,500</ThemedText>
            </View>
          </ThemedView>

          {/* Outstanding Debt */}
          <ThemedView type="backgroundElement" style={styles.smallCard}>
            <View style={[styles.smallIconContainer, { backgroundColor: theme.warning + '1A' }]}>
              <SymbolView name={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }} size={20} tintColor={theme.warning} />
            </View>
            <View style={styles.smallCardInfo}>
              <ThemedText type="small" themeColor="textSecondary">Outstanding Debt</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.smallCardValue}>₦5,000</ThemedText>
            </View>
          </ThemedView>

          {/* Gross Margin */}
          <ThemedView type="backgroundElement" style={styles.smallCard}>
            <View style={[styles.smallIconContainer, { backgroundColor: theme.primaryLight + '1A' }]}>
              <SymbolView name={{ ios: 'percent', android: 'pie_chart', web: 'pie_chart' }} size={20} tintColor={theme.primaryLight} />
            </View>
            <View style={styles.smallCardInfo}>
              <ThemedText type="small" themeColor="textSecondary">Gross Margin</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.smallCardValue}>65%</ThemedText>
            </View>
          </ThemedView>
        </View>

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
  dateText: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontWeight: '700',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 10,
    textTransform: 'uppercase',
  },
  liveRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    borderRadius: Spacing.four,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    boxShadow: '0px 4px 10px rgba(0,0,0,0.05)',
  },
  liveItem: {
    alignItems: 'center',
    gap: 4,
  },
  divider: {
    width: 1,
    height: '80%',
  },
  bigCard: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    boxShadow: '0px 4px 10px rgba(0,0,0,0.05)',
  },
  bigCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigCardBody: {
    gap: Spacing.one,
  },
  bigCardAmount: {
    fontSize: 32,
    fontWeight: '700',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  smallCard: {
    width: '47%',
    borderRadius: Spacing.four,
    padding: Spacing.three,
    boxShadow: '0px 4px 10px rgba(0,0,0,0.05)',
  },
  smallIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  smallCardInfo: {
    gap: 2,
  },
  smallCardValue: {
    fontSize: 18,
  },
});
