import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CustomerCard } from '@/components/ui/customer-card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { usePageContainerStyles } from '@/components/ui/page-container';
import { SearchBar } from '@/components/ui/search-bar';
import { Spacing } from '@/constants/theme';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { useRecords } from '@/hooks/use-records';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { useMemo, useState } from 'react';
import { FlatList, Platform, RefreshControl, StyleSheet, View } from 'react-native';

interface ClientAgg {
  clientName: string;
  totalSpend: number;
  totalPaid: number;
  balance: number;
  lastPurchaseDate: number;
  jobsCount: number;
}

export default function ClientsScreen() {

  const theme = useTheme();

  const { sortedBatches: batches, loading, refresh } = useRecords(theme);
  const { refreshing, onRefresh } = usePullRefresh([refresh]);
  const [searchQuery, setSearchQuery] = useState('');

  const clientsList = useMemo(() => {
    const map: Record<string, ClientAgg> = {};
    batches.forEach(batch => {
      const name = batch.clientName?.trim() || 'Unknown Client';
      if (!map[name]) {
        map[name] = {
          clientName: name,
          totalSpend: 0,
          totalPaid: 0,
          balance: 0,
          lastPurchaseDate: 0,
          jobsCount: 0,
        };
      }
      map[name].totalSpend += (batch.totalAmount || 0);
      map[name].totalPaid += (batch.totalPaid || 0);
      map[name].jobsCount += batch.records.length;
      
      const recordDate = new Date(batch.createdAt).getTime();
      if (recordDate > map[name].lastPurchaseDate) {
        map[name].lastPurchaseDate = recordDate;
      }
    });

    Object.values(map).forEach(c => {
      c.balance = c.totalSpend - c.totalPaid;
    });

    return Object.values(map).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [batches]);

  const filteredClients = useMemo(() => {
    if (!searchQuery) return clientsList;
    const lower = searchQuery.toLowerCase();
    return clientsList.filter(c => c.clientName.toLowerCase().includes(lower));
  }, [clientsList, searchQuery]);

  const { contentStyle } = usePageContainerStyles(false, 80);

  const headerComponent = (
    <View style={{ gap: Spacing.four, paddingBottom: Spacing.four, paddingHorizontal: Platform.OS === 'web' ? 0 : Spacing.four }}>
      <ThemedView style={styles.header}>
        <ThemedText type="subtitle" style={styles.title}>Client Management</ThemedText>
        <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
          View client history, lifetime value, and outstanding balances.
        </ThemedText>
      </ThemedView>

      <SearchBar
        placeholder="Search clients..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
    </View>
  );

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={styles.container}>
          {loading ? (
            <View style={[contentStyle, { paddingTop: Spacing.four }]}>
              {headerComponent}
              <View style={{ gap: Spacing.three, paddingHorizontal: Platform.OS === 'web' ? 0 : Spacing.four }}>
                <LoadingSkeleton width="100%" height={120} borderRadius={16} />
                <LoadingSkeleton width="100%" height={120} borderRadius={16} />
                <LoadingSkeleton width="100%" height={120} borderRadius={16} />
              </View>
            </View>
          ) : (
            <FlatList
              data={filteredClients}
              keyExtractor={(item) => item.clientName}
              contentContainerStyle={contentStyle}
              showsVerticalScrollIndicator={false}
              refreshControl={
                Platform.OS !== 'web'
                  ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
                  : undefined
              }
              ListHeaderComponent={headerComponent}
              ListEmptyComponent={
                <EmptyState
                  iconName="person.2.slash"
                  title="No Clients Found"
                  message={searchQuery ? "Try adjusting your search criteria." : "You don't have any client records yet."}
                />
              }
              renderItem={({ item: client }) => (
                <CustomerCard
                  name={client.clientName}
                  initials={client.clientName.substring(0, 2).toUpperCase()}
                >
                  <View style={styles.metricsContainer}>
                    <View style={styles.metricItem}>
                      <ThemedText type="small" themeColor="onSurfaceVariant">Lifetime Value</ThemedText>
                      <ThemedText style={{ fontWeight: '600' }}>{formatCurrency(client.totalSpend)}</ThemedText>
                    </View>
                    <View style={styles.metricItem}>
                      <ThemedText type="small" themeColor="onSurfaceVariant">Balance</ThemedText>
                      <ThemedText style={{ fontWeight: '600', color: client.balance > 0 ? theme.error : theme.onSurface }}>
                        {formatCurrency(client.balance)}
                      </ThemedText>
                    </View>
                    <View style={styles.metricItem}>
                      <ThemedText type="small" themeColor="onSurfaceVariant">Jobs</ThemedText>
                      <ThemedText style={{ fontWeight: '600' }}>{client.jobsCount}</ThemedText>
                    </View>
                    <View style={styles.metricItem}>
                      <ThemedText type="small" themeColor="onSurfaceVariant">Last Order</ThemedText>
                      <ThemedText style={{ fontWeight: '600' }}>{formatDate(client.lastPurchaseDate)}</ThemedText>
                    </View>
                  </View>
                </CustomerCard>
              )}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
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
  metricsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.four,
    justifyContent: 'space-between',
  },
  metricItem: {
    minWidth: '40%',
  },
});
