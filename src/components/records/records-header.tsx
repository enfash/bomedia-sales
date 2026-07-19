import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Menu, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { SearchBar } from '@/components/ui/search-bar';
import { FilterBar } from '@/components/ui/filter-bar';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';

interface RecordsHeaderProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  selectedBatches: string[];
  setSelectedBatches: (batches: string[]) => void;
  exportCSV: () => void;
  markSelectedAsPaid: () => void;
  dateFilter: string;
  setDateFilter: (d: string) => void;
  isMobile?: boolean;
}

export function RecordsHeader({
  searchQuery, setSearchQuery, statusFilter, setStatusFilter, selectedBatches, setSelectedBatches,
  exportCSV, markSelectedAsPaid, dateFilter, setDateFilter, isMobile = false
}: RecordsHeaderProps) {
  const router = useRouter();
  const [dateMenuVisible, setDateMenuVisible] = useState(false);
  const [bulkMenuVisible, setBulkMenuVisible] = useState(false);
  const theme = useTheme();

  const statuses = ['All', 'Paid', 'Partial', 'Unpaid'];

  const filterOptions = statuses.map(s => ({ label: s, value: s }));

  return (
    <View style={[styles.searchContainer, { flexDirection: 'column', gap: 12 }]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', width: '100%' }}>
        <View style={{ flex: 1 }}>
          <SearchBar
            placeholder="Search clients or dates"
            onChangeText={setSearchQuery}
            value={searchQuery}
          />
        </View>

        <Menu
          visible={dateMenuVisible}
          onDismiss={() => setDateMenuVisible(false)}
          anchor={
            <Button
              mode="outlined"
              onPress={() => setDateMenuVisible(true)}
              contentStyle={{ flexDirection: 'row-reverse' }}
              icon={() => <SymbolView name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={16} tintColor={theme.onSurfaceVariant} />}
              style={styles.datePill}
            >
              {dateFilter === 'All Time' ? 'Date' : dateFilter}
            </Button>
          }>
          {['All Time', 'This Month', 'Last Quarter'].map(dateRange => (
            <Menu.Item 
              key={dateRange} 
              onPress={() => { setDateFilter(dateRange); setDateMenuVisible(false); }} 
              title={dateRange} 
              titleStyle={{ color: dateFilter === dateRange ? theme.primary : theme.onSurface, fontWeight: dateFilter === dateRange ? '700' : '400' }}
            />
          ))}
        </Menu>
      </View>

      <FilterBar
        options={filterOptions}
        selectedValue={statusFilter}
        onSelect={setStatusFilter}
        style={{ marginHorizontal: -16 }}
      />
      
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', zIndex: 10 }}>
        {selectedBatches.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PrimaryButton 
              onPress={() => {
                router.push({ pathname: '/invoice', params: { batchId: selectedBatches.join(',') } });
                setSelectedBatches([]);
              }} 
            >
              Generate Invoice ({selectedBatches.length})
            </PrimaryButton>
            
            <Menu
              visible={bulkMenuVisible}
              onDismiss={() => setBulkMenuVisible(false)}
              anchor={
                <SecondaryButton 
                  onPress={() => setBulkMenuVisible(true)} 
                  contentStyle={{ flexDirection: 'row-reverse' }}
                  icon={() => <SymbolView name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={16} tintColor={theme.onSurfaceVariant} />}
                >
                  Bulk Actions
                </SecondaryButton>
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
    flex: 1,
    height: 48,
  },
  datePill: {
    justifyContent: 'center',
    height: 48,
  },
});
