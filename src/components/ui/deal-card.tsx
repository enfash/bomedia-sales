import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Pressable } from 'react-native';
import { Surface, Text } from 'react-native-paper';
import { SymbolView } from 'expo-symbols';
import { formatCurrency } from '@/utils/currency';

export interface DealCardProps {
  company: string;
  client: string;
  value: number;
  owner: string;
  daysActive: number;
  stage?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

/**
 * @description Standardized card for displaying a sales deal.
 * @props DealCardProps (company, client, value, owner, daysActive, stage, onPress, style, compact)
 * @example
 * <DealCard
 *   company="Acme Corp"
 *   client="John Doe"
 *   value={45000}
 *   owner="Alice Smith"
 *   daysActive={2}
 *   onPress={() => handlePress()}
 * />
 * @variants Elevated Surface (1dp). Compact mode available for Kanban columns.
 * @accessibility
 * - Card acts as a touchable button.
 */
export function DealCard({
  company,
  client,
  value,
  owner,
  daysActive,
  stage,
  onPress,
  style,
  compact = false,
}: DealCardProps) {
  return (
    <Surface
      style={[styles.card, compact && styles.cardCompact, style]}
      elevation={1}
    >
      <Pressable onPress={onPress} style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.7 }]}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text variant="titleMedium" style={styles.company} numberOfLines={1}>{company}</Text>
            <Text variant="bodyMedium" style={styles.client} numberOfLines={1}>{client}</Text>
          </View>
          <Text variant="titleMedium" style={styles.value}>
            {formatCurrency(value)}
          </Text>
        </View>

        {!compact && (
          <View style={styles.footer}>
            <View style={styles.ownerContainer}>
              <SymbolView
                name={{ ios: 'person.fill', android: 'person', web: 'person' }}
                size={14}
                tintColor="#6B7280"
              />
              <Text variant="labelMedium" style={styles.owner}>
                {owner}
              </Text>
            </View>
            <Text variant="labelMedium" style={styles.days}>
              Active for {daysActive} days
            </Text>
          </View>
        )}
        
        {compact && (
          <View style={styles.footerCompact}>
            <Text variant="labelSmall" style={styles.daysCompact}>
              {daysActive}d
            </Text>
            {stage && (
              <Text variant="labelSmall" style={styles.stageCompact}>
                {stage}
              </Text>
            )}
          </View>
        )}
      </Pressable>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardCompact: {
    borderRadius: 12,
  },
  pressable: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleContainer: {
    flex: 1,
    marginRight: 16,
  },
  company: {
    fontWeight: '600',
  },
  client: {
    color: '#6B7280',
    marginTop: 2,
  },
  value: {
    fontWeight: '700',
    color: '#2e388d', // Primary brand color
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  ownerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  owner: {
    color: '#454651',
    marginLeft: 6,
  },
  days: {
    color: '#6B7280',
  },
  footerCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  daysCompact: {
    color: '#6B7280',
  },
  stageCompact: {
    color: '#454651',
    fontWeight: '500',
  }
});
