import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Platform, ActivityIndicator, Pressable, TextInput, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRecords } from '@/hooks/use-records';
import { SalesBatch } from '@/components/records/types';

interface ClientAgg {
  clientName: string;
  totalSpend: number;
  totalPaid: number;
  balance: number;
  lastPurchaseDate: number;
  jobsCount: number;
}

export default function ClientsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const { sortedBatches: batches, loading } = useRecords(theme);
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

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentInset={insets}
        contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
      >
        <ThemedView style={styles.container}>
          <ThemedView style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>Client Management</ThemedText>
            <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
              View client history, lifetime value, and outstanding balances.
            </ThemedText>
          </ThemedView>

          <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.surfaceVariant }]}>
            <SymbolView
              name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
              size={18}
              tintColor={theme.onSurfaceVariant}
            />
            <TextInput
              style={[styles.searchInput, { color: theme.onSurface }]}
              placeholder="Search clients..."
              placeholderTextColor={theme.onSurfaceVariant}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <ThemedView type="surface" style={styles.card}>
            {loading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : filteredClients.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <SymbolView name={{ ios: 'person.2.slash', android: 'group_off', web: 'group_off' }} size={40} tintColor={theme.onSurfaceVariant} />
                <ThemedText style={{ marginTop: 12, color: theme.onSurfaceVariant }}>No clients found.</ThemedText>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableWrapper}>
                <View style={{ minWidth: 700 }}>
                  <View style={[styles.tableHeader, { borderBottomColor: theme.surfaceVariant }]}>
                    <Text style={[styles.th, { width: 200, color: theme.onSurfaceVariant }]}>Client Name</Text>
                    <Text style={[styles.th, { width: 80, color: theme.onSurfaceVariant, textAlign: 'right' }]}>Jobs</Text>
                    <Text style={[styles.th, { width: 140, color: theme.onSurfaceVariant, textAlign: 'right' }]}>Lifetime Value</Text>
                    <Text style={[styles.th, { width: 140, color: theme.onSurfaceVariant, textAlign: 'right' }]}>Outstanding Bal</Text>
                    <Text style={[styles.th, { width: 140, color: theme.onSurfaceVariant, textAlign: 'right' }]}>Last Order</Text>
                  </View>

                  {filteredClients.map((client, idx) => (
                    <View key={client.clientName} style={[styles.tableRow, { borderBottomColor: theme.surfaceVariant }, idx === filteredClients.length - 1 && { borderBottomWidth: 0 }]}>
                      <Text style={[styles.td, { width: 200, color: theme.onSurface, fontWeight: '600', paddingRight: 8 }]} numberOfLines={1}>{client.clientName}</Text>
                      <Text style={[styles.td, { width: 80, color: theme.onSurface, textAlign: 'right', paddingRight: 8 }]} numberOfLines={1}>{client.jobsCount}</Text>
                      <Text style={[styles.td, { width: 140, color: theme.onSurface, textAlign: 'right', fontWeight: '500', paddingRight: 8 }]} numberOfLines={1}>₦{client.totalSpend.toLocaleString()}</Text>
                      <Text style={[styles.td, { width: 140, color: client.balance > 0 ? (theme.error || '#EF4444') : theme.onSurfaceVariant, textAlign: 'right', fontWeight: client.balance > 0 ? '700' : '400', paddingRight: 8 }]} numberOfLines={1}>
                        ₦{client.balance.toLocaleString()}
                      </Text>
                      <Text style={[styles.td, { width: 140, color: theme.onSurfaceVariant, textAlign: 'right' }]} numberOfLines={1}>
                        {new Date(client.lastPurchaseDate).toLocaleDateString()}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </ThemedView>
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
    width: '100%',
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
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
  searchBar: {
    height: 50,
    borderRadius: Spacing.three,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    maxWidth: 400,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
  },
  card: {
    borderRadius: Spacing.four,
    overflow: 'hidden',
    boxShadow: '0px 4px 10px rgba(0,0,0,0.05)',
  },
  tableWrapper: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  th: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  td: {
    fontSize: 14,
  },
});
