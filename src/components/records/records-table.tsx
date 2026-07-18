import React from 'react';
import { View, StyleSheet, Text, Pressable, ScrollView, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Checkbox, Menu } from 'react-native-paper';
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

  let statusColor: string = theme.textSecondary;
  if (status === "Paid") statusColor = theme.success; 
  if (status === "Overpaid") statusColor = theme.primary; 
  if (status === "Partial") statusColor = theme.warning; 
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
  expandedBatches: Record<string, boolean>;
  toggleBatch: (id: string) => void;
  menuVisibleId: string | null;
  setMenuVisibleId: (id: string | null) => void;
  setSelectedPaymentBatch: (r: any) => void;
  setPaymentModalVisible: (v: boolean) => void;
  searchQuery: string;
}

export function RecordsTable({
  sortedBatches, loading, theme, compactMode, selectedBatches, setSelectedBatches, toggleSelectBatch,
  handleSort, sortColumn, sortDirection, expandedBatches, toggleBatch,
  menuVisibleId, setMenuVisibleId, setSelectedPaymentBatch, setPaymentModalVisible, searchQuery
}: RecordsTableProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 12 }}>Loading records...</ThemedText>
      </View>
    );
  }

  if (sortedBatches.length === 0) {
    return (
      <View style={styles.emptyRecords}>
        <SymbolView
          name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
          size={36}
          tintColor={theme.textSecondary}
        />
        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 8 }}>
          {searchQuery ? "No records match your search." : "No sales records yet."}
        </ThemedText>
      </View>
    );
  }

  if (isMobile) {
    return (
      <View style={{ gap: Spacing.three, paddingBottom: Spacing.four }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.two }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Checkbox 
              status={selectedBatches.length === sortedBatches.length && sortedBatches.length > 0 ? 'checked' : 'unchecked'} 
              onPress={() => {
                if (selectedBatches.length === sortedBatches.length) setSelectedBatches([]);
                else setSelectedBatches(sortedBatches.map(b => b.id));
              }} 
            />
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginLeft: 4 }}>Select All</Text>
          </View>
        </View>

        {sortedBatches.map(batch => {
          const isExpanded = expandedBatches[batch.id];
          const hasMultipleItems = batch.records.length > 1;

          return (
            <View key={batch.id} style={[styles.mobileCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.mobileCardHeader, { borderBottomColor: theme.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Checkbox 
                    status={selectedBatches.includes(batch.id) ? 'checked' : 'unchecked'} 
                    onPress={() => toggleSelectBatch(batch.id)} 
                    color={theme.primary}
                  />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>{batch.clientName || 'Unknown'}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>{new Date(batch.createdAt).toLocaleDateString()}</Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: batch.statusColor + '15' }]}>
                  <Text style={[styles.statusText, { color: batch.statusColor }]}>{batch.status.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.mobileCardBody}>
                <View style={styles.mobileCardRow}>
                  <Text style={{ color: theme.textSecondary, fontSize: 14 }}>Total Amount</Text>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>₦{(batch.totalAmount || 0).toLocaleString()}</Text>
                </View>
                <View style={[styles.mobileCardRow, { marginTop: 4 }]}>
                  <Text style={{ color: theme.textSecondary, fontSize: 14 }}>Balance Due</Text>
                  <Text style={{ color: batch.totalBalance > 0 ? theme.error : theme.text, fontWeight: '700', fontSize: 16 }}>₦{(batch.totalBalance || 0).toLocaleString()}</Text>
                </View>

                {/* Sub-items if expanded or just single item details */}
                {!hasMultipleItems ? (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                    <Text style={{ color: theme.text, fontSize: 13, lineHeight: 20 }} numberOfLines={2}>
                      {batch.records[0]?.material} • {batch.records[0]?.quantity} qty • {batch.records[0]?.width}x{batch.records[0]?.height} {batch.records[0]?.jobUnit}
                    </Text>
                  </View>
                ) : (
                  <Pressable onPress={() => toggleBatch(batch.id)} style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 14 }}>{batch.records.length} Items Batched</Text>
                    <SymbolView 
                      name={isExpanded ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                      size={20}
                      tintColor={theme.primary}
                    />
                  </Pressable>
                )}

                {isExpanded && hasMultipleItems && (
                  <View style={{ marginTop: 12, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: theme.border, gap: 12 }}>
                    {batch.records.map((record, idx) => {
                      const details = getRecordDetails(record, theme);
                      return (
                        <View key={record.id}>
                          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14, marginBottom: 2 }}>Item {idx + 1}: {record.material}</Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 4 }}>{record.quantity} qty • {record.width}x{record.height} {record.jobUnit}</Text>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Amt: ₦{(record.total || 0).toLocaleString()}</Text>
                            {/* Hide balance for batched items as payment is recorded at the batch level */}
                            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '500' }}>Bal: -</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={[styles.mobileCardActions, { backgroundColor: theme.backgroundSelected, borderTopColor: theme.border }]}>
                <Pressable onPress={() => router.push(`/invoice?batchId=${batch.id}`)} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.backgroundElement }}>
                  <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 14 }}>View Invoice</Text>
                </Pressable>
                {batch.totalBalance > 0 && (
                  <Pressable onPress={() => {
                    setSelectedPaymentBatch(batch);
                    setPaymentModalVisible(true);
                  }} style={{ paddingVertical: 10, paddingHorizontal: 16, backgroundColor: theme.primary, borderRadius: 8 }}>
                    <Text style={{ color: theme.backgroundElement, fontWeight: '600', fontSize: 14 }}>Add Payment</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  // Desktop/Tablet View (Table Layout)
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
      <View style={styles.tableWrapper}>
        {/* Table Header Row */}
        <View style={[styles.tableRow, styles.tableHeaderRow, { borderBottomColor: theme.backgroundSelected, paddingVertical: compactMode ? 8 : 16 }]}>
          <View style={[{ width: 40, backgroundColor: theme.backgroundElement }, Platform.OS === 'web' && { position: 'sticky' as any, left: 0, zIndex: 99 }]}>
            <Checkbox status={selectedBatches.length === sortedBatches.length && sortedBatches.length > 0 ? 'checked' : 'unchecked'} onPress={() => {
              if (selectedBatches.length === sortedBatches.length) setSelectedBatches([]);
              else setSelectedBatches(sortedBatches.map(b => b.id));
            }} />
          </View>
          <Pressable style={[{ width: 140, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.backgroundElement }, Platform.OS === 'web' && { position: 'sticky' as any, left: 40, zIndex: 99 }]} onPress={() => handleSort('Client')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'Client' ? theme.text : theme.textSecondary, fontWeight: sortColumn === 'Client' ? 'bold' : 'normal' }]} numberOfLines={1}>Client/Payee</Text>
            {sortColumn === 'Client' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.text} style={{ marginLeft: 4 }} />}
          </Pressable>
          <Pressable style={[{ width: 90, flexDirection: 'row', alignItems: 'center' }]} onPress={() => handleSort('Date')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'Date' ? theme.text : theme.textSecondary, fontWeight: sortColumn === 'Date' ? 'bold' : 'normal' }]} numberOfLines={1}>Date</Text>
            {sortColumn === 'Date' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.text} style={{ marginLeft: 4 }} />}
          </Pressable>
          <Text style={[styles.headerCell, { width: 70, color: theme.textSecondary }]} numberOfLines={1}>Type</Text>
          <Text style={[styles.headerCell, { width: 270, color: theme.textSecondary }]} numberOfLines={1}>Job Details</Text>
          <Pressable style={[{ width: 100, flexDirection: 'row', alignItems: 'center' }]} onPress={() => handleSort('Amount')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'Amount' ? theme.text : theme.textSecondary, fontWeight: sortColumn === 'Amount' ? 'bold' : 'normal' }]} numberOfLines={1}>Amount</Text>
            {sortColumn === 'Amount' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.text} style={{ marginLeft: 4 }} />}
          </Pressable>
          <Pressable style={[{ width: 80, flexDirection: 'row', alignItems: 'center' }]} onPress={() => handleSort('Status')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'Status' ? theme.text : theme.textSecondary, fontWeight: sortColumn === 'Status' ? 'bold' : 'normal' }]} numberOfLines={1}>Status</Text>
            {sortColumn === 'Status' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.text} style={{ marginLeft: 4 }} />}
          </Pressable>
          <Pressable style={[{ width: 90, flexDirection: 'row', alignItems: 'center' }]} onPress={() => handleSort('LoggedBy')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'LoggedBy' ? theme.text : theme.textSecondary, fontWeight: sortColumn === 'LoggedBy' ? 'bold' : 'normal' }]} numberOfLines={1}>Logged By</Text>
            {sortColumn === 'LoggedBy' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.text} style={{ marginLeft: 4 }} />}
          </Pressable>
          <Pressable style={[{ width: 100, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.backgroundElement }, Platform.OS === 'web' && { position: 'sticky' as any, right: 60, zIndex: 99 }]} onPress={() => handleSort('Balance')}>
            <Text style={[styles.headerCell, { color: sortColumn === 'Balance' ? theme.text : theme.textSecondary, fontWeight: sortColumn === 'Balance' ? 'bold' : 'normal' }]} numberOfLines={1}>Balance</Text>
            {sortColumn === 'Balance' && <SymbolView name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'} size={12} tintColor={theme.text} style={{ marginLeft: 4 }} />}
          </Pressable>
          <View style={[{ width: 120, justifyContent: 'center', backgroundColor: theme.backgroundElement }, Platform.OS === 'web' && { position: 'sticky' as any, right: 0, zIndex: 99 }]}>
            <Text style={[styles.headerCell, { color: theme.textSecondary }]} numberOfLines={1}>Actions</Text>
          </View>
        </View>

        {/* Table Body */}
        {sortedBatches.map((batch) => {
          const isExpanded = expandedBatches[batch.id];
          const hasMultipleItems = batch.records.length > 1;

          return (
            <React.Fragment key={batch.id}>
              <View style={[styles.tableRow, { borderBottomColor: 'rgba(0,0,0,0.05)', backgroundColor: isExpanded ? 'rgba(0,0,0,0.02)' : 'transparent', paddingVertical: compactMode ? 6 : 12 }]}>
                <View style={[styles.cell, { width: 40, justifyContent: 'center', backgroundColor: theme.backgroundElement }, Platform.OS === 'web' && { position: 'sticky' as any, left: 0, zIndex: 90 }]}>
                  <Checkbox 
                    status={selectedBatches.includes(batch.id) ? 'checked' : 'unchecked'} 
                    onPress={() => toggleSelectBatch(batch.id)} 
                  />
                </View>
                <View style={[{ width: 140, justifyContent: 'center', backgroundColor: theme.backgroundElement }, Platform.OS === 'web' && { position: 'sticky' as any, left: 40, zIndex: 90 }]}>
                  <Pressable 
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => hasMultipleItems && toggleBatch(batch.id)}
                  >
                    {hasMultipleItems && (
                      <SymbolView 
                        name={isExpanded ? { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' } : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                        size={16}
                        tintColor={theme.textSecondary}
                        style={{ marginRight: 4 }}
                      />
                    )}
                    <Text style={[styles.cell, { color: theme.text, fontWeight: '600', paddingRight: 0 }]} numberOfLines={1}>
                      {batch.clientName || 'Unknown'}
                    </Text>
                  </Pressable>
                </View>
                <View style={[styles.cell, { width: 90 }]}>
                  <Text style={{ color: theme.text, fontSize: 13 }} numberOfLines={1}>
                    {new Date(batch.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={[styles.cell, { width: 70, color: theme.text }]} numberOfLines={1}>
                  {batch.records.length > 1 ? "Batch" : (batch.records[0]?.type || 'Sale')}
                </Text>
                <Text style={[styles.cell, { width: 270, color: theme.textSecondary }]} numberOfLines={1}>
                  {batch.records.length > 1 ? `${batch.records.length} items batched` : (batch.records[0]?.material + ' • ' + batch.records[0]?.quantity + ' qty • ' + batch.records[0]?.width + 'x' + batch.records[0]?.height + ' ' + batch.records[0]?.jobUnit)}
                </Text>
                <Text style={[styles.cell, { width: 100, color: theme.text }]} numberOfLines={1}>
                  ₦{(batch.totalAmount || 0).toLocaleString()}
                </Text>
                <View style={[styles.cell, { width: 80 }]}>
                  <View style={[styles.statusBadge, { backgroundColor: batch.statusColor + '20' }]}>
                    <Text style={[styles.statusText, { color: batch.statusColor }]}>{batch.status}</Text>
                  </View>
                </View>
                <Text style={[styles.cell, { width: 90, color: theme.text }]} numberOfLines={1}>
                  {batch.records[0]?.loggedBy || 'Admin'}
                </Text>
                <View style={[{ width: 100, justifyContent: 'center', backgroundColor: theme.backgroundElement }, Platform.OS === 'web' && { position: 'sticky' as any, right: 60, zIndex: 90 }]}>
                  <Text style={[styles.cell, { color: theme.text, fontWeight: '500' }]} numberOfLines={1}>
                    ₦{(batch.totalBalance || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={[styles.cell, { width: 120, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.backgroundElement, justifyContent: 'flex-end', paddingRight: 16 }, Platform.OS === 'web' && { position: 'sticky' as any, right: 0, zIndex: 90 }]}>
                  {batch.totalBalance > 0 && (
                    <Pressable 
                      style={{ backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 8 }}
                      onPress={() => {
                        setSelectedPaymentBatch(batch);
                        setPaymentModalVisible(true);
                      }}
                    >
                      <Text style={{ color: theme.backgroundElement, fontSize: 12, fontWeight: '600' }}>Pay</Text>
                    </Pressable>
                  )}
                  <Menu
                    visible={menuVisibleId === batch.id}
                    onDismiss={() => setMenuVisibleId(null)}
                    anchor={
                      <Pressable 
                        style={{ padding: 4 }}
                        onPress={() => setMenuVisibleId(batch.id)}
                      >
                        <SymbolView name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }} size={20} tintColor={theme.textSecondary} />
                      </Pressable>
                    }>
                    <Menu.Item onPress={() => {
                      setMenuVisibleId(null);
                      router.push(`/invoice?batchId=${batch.id}`);
                    }} title="View Invoice" leadingIcon="file-document-outline" />
                  </Menu>
                </View>
              </View>

              {/* Expanded Items */}
              {isExpanded && hasMultipleItems && batch.records.map((record, idx) => {
                const details = getRecordDetails(record, theme);
                return (
                  <View key={record.id} style={[styles.tableRow, { borderBottomColor: 'rgba(0,0,0,0.03)', backgroundColor: 'transparent', paddingVertical: compactMode ? 6 : 12 }]}>
                    <View style={[styles.cell, { width: 40, backgroundColor: theme.backgroundElement }, Platform.OS === 'web' && { position: 'sticky' as any, left: 0, zIndex: 90 }]} />
                    <View style={[styles.cell, { width: 140, backgroundColor: theme.backgroundElement }, Platform.OS === 'web' && { position: 'sticky' as any, left: 40, zIndex: 90 }]} />
                    <Text style={[styles.cell, { width: 90, color: theme.textSecondary, fontStyle: 'italic', paddingLeft: 16 }]} numberOfLines={1}>
                      Item {idx + 1}
                    </Text>
                    <Text style={[styles.cell, { width: 70, color: theme.textSecondary }]} numberOfLines={1}>
                      {details.type}
                    </Text>
                    <Text style={[styles.cell, { width: 270, color: theme.textSecondary }]} numberOfLines={1}>
                      {record.material + ' • ' + record.quantity + ' qty • ' + record.width + 'x' + record.height + ' ' + record.jobUnit}
                    </Text>
                    <Text style={[styles.cell, { width: 100, color: theme.textSecondary }]} numberOfLines={1}>
                      ₦{(record.total || 0).toLocaleString()}
                    </Text>
                    <View style={[styles.cell, { width: 80 }]}>
                      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>-</Text>
                    </View>
                    <Text style={[styles.cell, { width: 90, color: theme.textSecondary }]} numberOfLines={1}>
                      -
                    </Text>
                    <Text style={[styles.cell, { width: 100, color: theme.textSecondary }]} numberOfLines={1}>
                      ₦{(details.balance || 0).toLocaleString()}
                    </Text>
                    <View style={[styles.cell, { width: 60, alignItems: 'center' }]}>
                      <Menu
                        visible={menuVisibleId === record.id}
                        onDismiss={() => setMenuVisibleId(null)}
                        anchor={
                          <Pressable style={{ padding: 4 }} onPress={() => setMenuVisibleId(record.id)}>
                            <SymbolView name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }} size={20} tintColor={theme.textSecondary} />
                          </Pressable>
                        }>
                        {/* Sub-item balance is no longer tracked independently, hiding Add Payment for sub-items */}
                        {details.balance > 0 && batch.records.length === 1 && (
                          <Menu.Item onPress={() => {
                            setMenuVisibleId(null);
                            setSelectedPaymentBatch(record);
                            setPaymentModalVisible(true);
                          }} title="Add Payment" leadingIcon="cash" />
                        )}
                      </Menu>
                    </View>
                  </View>
                );
              })}
            </React.Fragment>
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
  tableWrapper: {
    minWidth: 1000,
    paddingBottom: Spacing.four,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    minWidth: 1050,
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
  mobileCard: {
    borderWidth: 1,
    borderRadius: 8, // Round Eight
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  mobileCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  mobileCardBody: {
    padding: Spacing.three,
  },
  mobileCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  mobileCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: Spacing.two,
    borderTopWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.02)',
    gap: Spacing.two,
  },
});
