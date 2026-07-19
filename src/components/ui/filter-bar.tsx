import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterBarProps {
  options: FilterOption[];
  selectedValue?: string;
  onSelect: (value: string) => void;
  style?: any;
}

/**
 * @description Horizontal scrollable filter bar with selectable chips.
 * @props FilterBarProps (options array, selectedValue, onSelect callback, style)
 * @example
 * <FilterBar 
 *   options={[{ label: 'All', value: 'all' }, { label: 'Paid', value: 'paid' }]} 
 *   selectedValue={filter} 
 *   onSelect={setFilter} 
 * />
 * @variants N/A
 * @accessibility 
 * - Uses horizontal scroll; ensure items are reachable via keyboard/screen reader swipe.
 * - Active state is communicated visually and through `selected` prop.
 */
export function FilterBar({ options, selectedValue, onSelect, style }: FilterBarProps) {
  return (
    <View style={style}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {options.map((option) => {
          const isSelected = selectedValue === option.value;
          return (
            <Chip
              key={option.value}
              mode={isSelected ? 'flat' : 'outlined'}
              selected={isSelected}
              onPress={() => onSelect(option.value)}
              style={styles.chip}
            >
              {option.label}
            </Chip>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    borderRadius: 8,
  },
});
