import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';

interface QuotaCardProps {
  theme: any;
  totalRevenue: number;
  totalPaid: number;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
}

export function QuotaCard({ theme, totalRevenue, totalPaid, statusFilter, setStatusFilter }: QuotaCardProps) {
  const tabs = [
    { id: 'All', label: 'Total Billed', value: totalRevenue, color: theme.primary },
    { id: 'Paid', label: 'Collected', value: totalPaid, color: theme.success },
    { id: 'Unpaid', label: 'Outstanding Balance', value: totalRevenue - totalPaid, color: theme.error }
  ];

  return (
    <View style={styles.cardContainer}>
      {tabs.map((tab) => {
        const isActive = statusFilter === tab.id;
        return (
          <Pressable 
            key={tab.id}
            style={[
              styles.tabCard,
              { 
                backgroundColor: isActive ? theme.primary : theme.backgroundElement,
                borderColor: isActive ? theme.primary : theme.border,
              }
            ]} 
            onPress={() => setStatusFilter(tab.id)}
          >
            <Text style={[styles.tabLabel, { color: isActive ? '#ffffff' : theme.textSecondary }]} numberOfLines={1}>
              {tab.label}
            </Text>
            <Text style={[styles.tabValue, { color: isActive ? '#ffffff' : tab.color }]} numberOfLines={1}>
              ₦{tab.value.toLocaleString()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  tabCard: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  tabValue: {
    fontSize: 16,
    fontWeight: '700',
  },
});
