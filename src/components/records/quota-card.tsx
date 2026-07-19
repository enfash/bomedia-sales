import React from 'react';
import { View, StyleSheet } from 'react-native';
import { KPICard } from '@/components/ui/kpi-card';

interface QuotaCardProps {
  theme: any;
  totalRevenue: number;
  totalPaid: number;
}

export function QuotaCard({ theme, totalRevenue, totalPaid }: QuotaCardProps) {
  const cards = [
    { 
      id: 'All', 
      label: 'Total Billed', 
      value: `₦${totalRevenue.toLocaleString()}`, 
      iconName: { ios: 'doc.text', android: 'receipt', web: 'receipt' } as const,
      color: theme.primary 
    },
    { 
      id: 'Paid', 
      label: 'Collected', 
      value: `₦${totalPaid.toLocaleString()}`, 
      iconName: { ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' } as const,
      color: '#2E7D32' 
    },
    { 
      id: 'Unpaid', 
      label: 'Outstanding', 
      value: `₦${(totalRevenue - totalPaid).toLocaleString()}`, 
      iconName: { ios: 'exclamationmark.circle', android: 'error', web: 'error' } as const,
      color: theme.error 
    }
  ];

  return (
    <View style={styles.cardContainer}>
      {cards.map((card) => (
        <KPICard
          key={card.id}
          title={card.label}
          value={card.value}
          iconName={card.iconName}
          iconColor={card.color}
          iconBackgroundColor={card.color + '20'}
          style={styles.card}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    flex: 1,
  },
});
