import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { toggleDensity, useDensity } from '@/hooks/use-density';
import { useTheme } from '@/hooks/use-theme';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

/** Compact/comfortable row-density switch for the desktop data-tables. */
export function DensityToggle() {
  const theme = useTheme();
  const density = useDensity();
  const compact = density === 'compact';

  return (
    <Pressable
      onPress={toggleDensity}
      accessibilityLabel={compact ? 'Switch to comfortable rows' : 'Switch to compact rows'}
      style={({ pressed }) => [styles.btn, { borderColor: theme.outlineVariant }, pressed && { opacity: 0.75 }]}
    >
      <Feather name={compact ? 'menu' : 'list'} size={15} color={theme.onSurfaceVariant} />
      <ThemedText type="smallBold" style={{ color: theme.onSurface, fontSize: 12 }}>
        {compact ? 'Compact' : 'Comfortable'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
});
