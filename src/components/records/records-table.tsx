import React, { useState } from 'react';
import { View, StyleSheet, Text, Pressable, ScrollView, Platform, ActivityIndicator, useWindowDimensions, FlatList } from 'react-native';
import { Checkbox, useTheme as usePaperTheme } from 'react-native-paper';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { SalesBatch, SalesRecord } from './types';
import { Spacing } from '@/constants/theme';

export const getRecordDetails = (record: SalesRecord, theme: any) => {
  const amountPaid = record.amountPaid || 0;
  const total = record.total || 0;
  const balance = total - amountPaid;
  
  let status = "Unpaid";
  if (amountPaid > total) status = "Overpaid";
  else if (amountPaid === total && total > 0) status = "Paid";
  else if (amountPaid > 0) status = "Partial";
  
  const description = `${record.width}x${record.height} ${record.jobUnit}`;
  const type = record.type || "Sale";
  const loggedBy = record.loggedBy || "Admin";

  let statusColor: string = theme.onSurfaceVariant;
  if (status === "Paid") statusColor = '#2E7D32'; 
  if (status === "Overpaid") statusColor = theme.primary; 
  if (status === "Partial") statusColor = '#EF6C00'; 
  if (status === "Unpaid") statusColor = theme.error; 

  return { amountPaid, balance, status, statusColor, description, type, loggedBy };
};

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
  sortedBatches, loading, theme, compactMode, selectedBatches, setSelectedBatches, toggleSelectBatch,
  handleSort, sortColumn, sortDirection, searchQuery, ListHeaderComponent, contentContainerStyle
}: RecordsTableProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const paperTheme = usePaperTheme();
  
  const [selectionMode, setSelectionMode] = useState(false);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginTop: 12 }}>Loading records...</ThemedText>
      </View>
    );
  }

  if (sortedBatches.length === 0) {
    return (
      <View style={styles.emptyRecords}>
        <SymbolView
          name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
          size={36}
          tintColor={theme.onSurfaceVariant}
        />
        <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginTop: 8 }}>
          {searchQuery ? "No records match your search." : "No sales records yet."}
        </ThemedText>
      </View>
    );
  }

  if (isMobile) {
    return (
      <FlatList
        data={sortedBatches}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeaderComponent}
        contentContainerStyle={contentContainerStyle || { paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: batch }) => {
          const isSelected = selectedBatches.includes(batch.id);
          const initials = (batch.clientName || 'Unknown').substring(0, 2).toUpperCase();

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
              style={[
                styles.flatListItem, 
                { 
                  backgroundColor: isSelected ? paperTheme.colors.secondaryContainer : theme.surface,
                  borderBottomColor: theme.outline,
                }
              ]}
            >
              {selectionMode && (
                <View style={{ marginRight: 12 }}>
                  <Checkbox 
                    status={isSelected ? 'checked' : 'unchecked'} 
                    onPress={() => toggleSelectBatch(batch.id)} 
                    color={theme.primary}
                  />
                </View>
              )}
              
              {!selectionMode && (
                <View style={[styles.avatar, { backgroundColor: paperTheme.colors.primaryContainer }]}>
                  <Text style={{ color: paperTheme.colors.onPrimaryContainer, fontWeight: 'bold', fontSize: 16 }}>{initials}</Text>
                </View>
              )}

              <View style={{ flex: 1, justifyContent: 'center' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.onSurface, fontWeight: '600', fontSize: 16 }} numberOfLines={1}>
                    {batch.clientName || 'Unknown'}
                  </Text>
                  <Text style={{ color: theme.onSurface, fontWeight: '700', fontSize: 16 }}>
                    ₦{(batch.totalAmount || 0).toLocaleString()}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: theme.onSurfaceVariant, fontSize: 13 }}>
                      {new Date(batch.createdAt).toLocaleDateString()}
                    </Text>
                    <Text style={{ color: theme.onSurfaceVariant, fontSize: 13, marginHorizontal: 6 }}>•</Text>
                    <Text style={{ color: theme.onSurfaceVariant, fontSize: 13 }}>
                      {batch.records.length} item{batch.records.length !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: paperTheme.colors.surfaceVariant }]}>
                    <Text style={[styles.statusText, { color: batch.statusColor }]}>{batch.status.toUpperCase()}</Text>
                  </View>
                </View>
              </View>

              {!selectionMode && (
                <SymbolView 
                  name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} 
                  size={20} 
                  tintColor={theme.onSurfaceVariant} 
                  style={{ marginLeft: 12 }} 
                />
              )}
            </Pressable>
          );
        }}
      />
    );
  }

  // Desktop/Tablet View (Table Layout)
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
      <View style={styles.tableWrapper}>
        {/* Table Header Row */}
        <View style={[styles.tableRow, styles.tableHeaderRow, { borderBottomColor: theme.outline, paddingVertical: compactMode ? 8 : 16 }]}>
          <View style={[{ width: 40, backgroundColor: theme.surface }, Platform.OS === 'web' && { position: 'sticky' as any, left: 0, zIndex: 99 }]}>
            <Checkbox status={selectedBatches.length === sortedBatches.length && sortedBatches.length > 0 ? 'checked' : 'unchecked'} onPress={() => {
              if (selectedBatches.length === sortedBatches.length) setSelectedBatches([]);
              else setSelectedBatches(sortedBatches.map(b => b.id));
            }} />
          </View>
          <Pressable style={[{ width: 140, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface }, Platform.OS === 'web' && { position: 'sticky' as any, left: 40, zIndex: 99 }]} onPress={() => handleSort('Client')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'Client' ? theme.onSurface : theme.onSurfaceVariant, fontWeight: sortColumn === 'Client' ? 'bold' : 'normal' }]} numberOfLines={1}>Client/Payee</Text>
            {sortColumn === 'Client' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.onSurface} style={{ marginLeft: 4 }} />}
          </Pressable>
          <Pressable style={[{ width: 90, flexDirection: 'row', alignItems: 'center' }]} onPress={() => handleSort('Date')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'Date' ? theme.onSurface : theme.onSurfaceVariant, fontWeight: sortColumn === 'Date' ? 'bold' : 'normal' }]} numberOfLines={1}>Date</Text>
            {sortColumn === 'Date' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.onSurface} style={{ marginLeft: 4 }} />}
          </Pressable>
          <Text style={[styles.headerCell, { width: 70, color: theme.onSurfaceVariant }]} numberOfLines={1}>Type</Text>
          <Text style={[styles.headerCell, { width: 270, color: theme.onSurfaceVariant }]} numberOfLines={1}>Job Details</Text>
          <Pressable style={[{ width: 100, flexDirection: 'row', alignItems: 'center' }]} onPress={() => handleSort('Amount')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'Amount' ? theme.onSurface : theme.onSurfaceVariant, fontWeight: sortColumn === 'Amount' ? 'bold' : 'normal' }]} numberOfLines={1}>Amount</Text>
            {sortColumn === 'Amount' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.onSurface} style={{ marginLeft: 4 }} />}
          </Pressable>
          <Pressable style={[{ width: 80, flexDirection: 'row', alignItems: 'center' }]} onPress={() => handleSort('Status')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'Status' ? theme.onSurface : theme.onSurfaceVariant, fontWeight: sortColumn === 'Status' ? 'bold' : 'normal' }]} numberOfLines={1}>Status</Text>
            {sortColumn === 'Status' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.onSurface} style={{ marginLeft: 4 }} />}
          </Pressable>
          <Pressable style={[{ width: 90, flexDirection: 'row', alignItems: 'center' }]} onPress={() => handleSort('LoggedBy')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'LoggedBy' ? theme.onSurface : theme.onSurfaceVariant, fontWeight: sortColumn === 'LoggedBy' ? 'bold' : 'normal' }]} numberOfLines={1}>Logged By</Text>
            {sortColumn === 'LoggedBy' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.onSurface} style={{ marginLeft: 4 }} />}
          </Pressable>
          <Pressable style={[{ width: 100, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface }, Platform.OS === 'web' && { position: 'sticky' as any, right: 0, zIndex: 99 }]} onPress={() => handleSort('Balance')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'Balance' ? theme.onSurface : theme.onSurfaceVariant, fontWeight: sortColumn === 'Balance' ? 'bold' : 'normal' }]} numberOfLines={1}>Balance</Text>
            {sortColumn === 'Balance' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.onSurface} style={{ marginLeft: 4 }} />}
          </Pressable>
        </View>

        {/* Table Body */}
        {sortedBatches.map((batch) => {
          return (
            <Pressable 
              key={batch.id} 
              onPress={() => router.push(`/transaction/${batch.id}`)}
              style={({ pressed }) => [
                styles.tableRow, 
                { 
                  borderBottomColor: theme.outline, 
                  backgroundColor: pressed ? paperTheme.colors.secondaryContainer : 'transparent', 
                  paddingVertical: compactMode ? 6 : 12 
                }
              ]}
            >
              <View style={[styles.cell, { width: 40, justifyContent: 'center', backgroundColor: theme.surface }, Platform.OS === 'web' && { position: 'sticky' as any, left: 0, zIndex: 90 }]}>
                <Checkbox 
                  status={selectedBatches.includes(batch.id) ? 'checked' : 'unchecked'} 
                  onPress={() => toggleSelectBatch(batch.id)} 
                />
              </View>
              <View style={[{ width: 140, justifyContent: 'center', backgroundColor: theme.surface }, Platform.OS === 'web' && { position: 'sticky' as any, left: 40, zIndex: 90 }]}>
                <Text style={[styles.cell, { color: theme.onSurface, fontWeight: '600', paddingRight: 0 }]} numberOfLines={1}>
                  {batch.clientName || 'Unknown'}
                </Text>
              </View>
              <View style={[styles.cell, { width: 90 }]}>
                <Text style={{ color: theme.onSurface, fontSize: 13 }} numberOfLines={1}>
                  {new Date(batch.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={[styles.cell, { width: 70, color: theme.onSurface }]} numberOfLines={1}>
                {batch.records.length > 1 ? "Batch" : (batch.records[0]?.type || 'Sale')}
              </Text>
              <Text style={[styles.cell, { width: 270, color: theme.onSurfaceVariant }]} numberOfLines={1}>
                {batch.records.length > 1 ? `${batch.records.length} items batched` : (batch.records[0]?.material + ' • ' + batch.records[0]?.quantity + ' qty • ' + batch.records[0]?.width + 'x' + batch.records[0]?.height + ' ' + batch.records[0]?.jobUnit)}
              </Text>
              <Text style={[styles.cell, { width: 100, color: theme.onSurface }]} numberOfLines={1}>
                ₦{(batch.totalAmount || 0).toLocaleString()}
              </Text>
              <View style={[styles.cell, { width: 80 }]}>
                <View style={[styles.statusBadge, { backgroundColor: paperTheme.colors.surfaceVariant }]}>
                  <Text style={[styles.statusText, { color: batch.statusColor }]}>{batch.status}</Text>
                </View>
              </View>
              <Text style={[styles.cell, { width: 90, color: theme.onSurface }]} numberOfLines={1}>
                {batch.records[0]?.loggedBy || 'Admin'}
              </Text>
              <View style={[{ width: 100, justifyContent: 'center', backgroundColor: theme.surface }, Platform.OS === 'web' && { position: 'sticky' as any, right: 0, zIndex: 90 }]}>
                <Text style={[styles.cell, { color: theme.onSurface, fontWeight: '500' }]} numberOfLines={1}>
                  ₦{(batch.totalBalance || 0).toLocaleString()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    padding: Spacing.six,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyRecords: {
    padding: Spacing.six,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  flatListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 88, // Material 3 recommended touch target & spacing
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  tableWrapper: {
    minWidth: 930,
    paddingBottom: Spacing.four,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    minWidth: 930,
  },
  tableHeaderRow: {
    borderBottomWidth: 2,
    paddingVertical: Spacing.four,
  },
  headerCell: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cell: {
    fontSize: 14,
    paddingRight: Spacing.two,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
