import React, { useState } from 'react';
import { View, StyleSheet, TextInput, Pressable, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Menu } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';

interface RecordsHeaderProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedBatches: string[];
  setSelectedBatches: (batches: string[]) => void;
  exportCSV: () => void;
  markSelectedAsPaid: () => void;
  dateFilter: string;
  setDateFilter: (d: string) => void;
}

export function RecordsHeader({
  searchQuery, setSearchQuery, selectedBatches, setSelectedBatches,
  exportCSV, markSelectedAsPaid, dateFilter, setDateFilter
}: RecordsHeaderProps) {
  const router = useRouter();
  const [dateMenuVisible, setDateMenuVisible] = useState(false);
  const [bulkMenuVisible, setBulkMenuVisible] = useState(false);
  const theme = useTheme();

  return (
    <View style={[styles.searchContainer, { flexDirection: 'column', gap: 12 }]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', width: '100%' }}>
        <View style={[styles.searchBar, { backgroundColor: theme.backgroundElement, borderColor: theme.border, flex: 1 }]}>
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            size={16}
            tintColor={theme.textSecondary}
          />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search clients or dates"
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <Menu
          visible={dateMenuVisible}
          onDismiss={() => setDateMenuVisible(false)}
          anchor={
            <Pressable 
              onPress={() => setDateMenuVisible(true)}
              style={[styles.datePill, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            >
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '500' }}>{dateFilter === 'All Time' ? 'Date' : dateFilter}</Text>
              <SymbolView name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={14} tintColor={theme.textSecondary} />
            </Pressable>
          }>
          {['All Time', 'This Month', 'Last Quarter'].map(dateRange => (
            <Menu.Item 
              key={dateRange} 
              onPress={() => { setDateFilter(dateRange); setDateMenuVisible(false); }} 
              title={dateRange} 
              titleStyle={{ color: dateFilter === dateRange ? theme.primary : theme.text, fontWeight: dateFilter === dateRange ? '700' : '400' }}
            />
          ))}
        </Menu>
      </View>
      
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', zIndex: 10 }}>
        {selectedBatches.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable 
              onPress={() => {
                router.push({ pathname: '/invoice', params: { batchId: selectedBatches.join(',') } });
                setSelectedBatches([]);
              }} 
              style={({ pressed }) => [
                styles.actionButton, 
                { backgroundColor: theme.primary, paddingHorizontal: 16, paddingVertical: 10 },
                pressed && { opacity: 0.7 }
              ]}
            >
              <Text style={[styles.actionButtonText, { color: '#FFF' }]}>Generate Invoice ({selectedBatches.length})</Text>
            </Pressable>
            
            <Menu
              visible={bulkMenuVisible}
              onDismiss={() => setBulkMenuVisible(false)}
              anchor={
                <Pressable 
                  onPress={() => setBulkMenuVisible(true)} 
                  style={({ pressed }) => [
                    styles.actionButton, 
                    { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 16, paddingVertical: 10 },
                    pressed && { opacity: 0.7 }
                  ]}
                >
                  <Text style={[styles.actionButtonText, { color: theme.text }]}>Bulk Actions</Text>
                  <SymbolView name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={14} tintColor={theme.textSecondary} />
                </Pressable>
              }>
              <Menu.Item onPress={exportCSV} title={`Export Selected to CSV`} />
              <Menu.Item onPress={markSelectedAsPaid} title="Mark as Paid" />
              <Menu.Item onPress={() => alert("Payment reminders coming soon!")} title="Send Payment Reminders" />
            </Menu>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    width: '100%',
  },
  searchBar: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 16,
  },
  datePill: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionButton: {
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
