import React, { useState } from 'react';
import { View, StyleSheet, Pressable, FlatList } from 'react-native';
import { Checkbox, useTheme as usePaperTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SalesBatch } from './types';
import { Spacing } from '@/constants/theme';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { TransactionCard } from '@/components/ui/transaction-card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

interface RecordsTableProps {
  sortedBatches: SalesBatch[];
  loading: boolean;
  theme: any;
  compactMode: boolean;
  selectedBatches: string[];
  setSelectedBatches: (ids: string[]) => void;
  toggleSelectBatch: (id: string) => void;
  handleSort: (col: string) => void;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  searchQuery: string;
  ListHeaderComponent?: React.ReactElement;
  contentContainerStyle?: any;
}

export function RecordsTable({
  sortedBatches, loading, theme, selectedBatches, toggleSelectBatch,
  searchQuery, ListHeaderComponent, contentContainerStyle
}: RecordsTableProps) {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const [selectionMode, setSelectionMode] = useState(false);

  return (
    <FlatList
      data={sortedBatches}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={() => {
        if (loading) {
          return (
            <View style={{ padding: Spacing.four, gap: Spacing.three }}>
              <LoadingSkeleton width="100%" height={88} borderRadius={16} />
              <LoadingSkeleton width="100%" height={88} borderRadius={16} />
              <LoadingSkeleton width="100%" height={88} borderRadius={16} />
            </View>
          );
        }
        return (
          <EmptyState 
            iconName="doc.text.magnifyingglass" 
            title="No records found" 
            message="Try adjusting your filters or add a new transaction."
          />
        );
      }}
      contentContainerStyle={contentContainerStyle || { paddingBottom: 100, paddingHorizontal: Spacing.four }}
      showsVerticalScrollIndicator={false}
      renderItem={({ item: batch }) => {
        const isSelected = selectedBatches.includes(batch.id);

        const handlePress = () => {
          if (selectionMode) {
            toggleSelectBatch(batch.id);
          } else {
            router.push(`/transaction/${batch.id}`);
          }
        };

        const handleLongPress = () => {
          if (!selectionMode) setSelectionMode(true);
          toggleSelectBatch(batch.id);
        };

        return (
          <Pressable 
            onPress={handlePress}
            onLongPress={handleLongPress}
            delayLongPress={300}
            style={styles.rowContainer}
          >
            {selectionMode && (
              <View style={styles.checkboxContainer}>
                <Checkbox 
                  status={isSelected ? 'checked' : 'unchecked'} 
                  onPress={() => toggleSelectBatch(batch.id)} 
                  color={theme.primary}
                />
              </View>
            )}
            
            <View style={{ flex: 1 }}>
              <TransactionCard 
                customerName={batch.clientName || 'Unknown'}
                status={batch.status}
                date={formatDate(batch.createdAt)}
                total={formatCurrency(batch.totalAmount || 0)}
                itemCount={batch.records.length}
                style={{
                  backgroundColor: isSelected ? paperTheme.colors.secondaryContainer : theme.surface,
                  marginBottom: 8,
                }}
              />
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  checkboxContainer: {
    marginRight: Spacing.three,
  },
});
