import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/utils/color';

/**
 * One row in the web sidebar.
 *
 * The two web shells build their nav differently — the tabs shell must use
 * literal `TabTrigger`s, the detail shell maps `WEB_NAV` — but a row has to
 * LOOK the same in both, or the sidebar appears to restyle itself when you open
 * a detail screen. That appearance lives here and nowhere else.
 */
export function useSidebarCompact() {
  const { width } = useWindowDimensions();
  return width < 768;
}

export function SidebarNavItem({
  icon,
  label,
  active = false,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  active?: boolean;
}) {
  const theme = useTheme();
  const isCompact = useSidebarCompact();

  return (
    <ThemedView
      type="surface"
      style={[
        styles.row,
        isCompact && styles.rowCompact,
        active && { backgroundColor: withAlpha(theme.onSurface, 0.1) },
      ]}
    >
      <Feather
        name={icon}
        size={isCompact ? 20 : 18}
        color={active ? theme.onSurface : theme.onSurfaceVariant}
      />
      {!isCompact && (
        <ThemedText
          type="default"
          themeColor={active ? 'onSurface' : 'onSurfaceVariant'}
          style={{ flex: 1, fontWeight: active ? '600' : 'normal' }}
        >
          {label}
        </ThemedText>
      )}
    </ThemedView>
  );
}

/**
 * A row-shaped placeholder. The admin destinations are only known once the
 * role read returns, and without this the sidebar grows under the cursor a
 * second after the page paints. Same height as a real row, so nothing moves
 * when the real items replace it.
 */
export function SidebarNavItemSkeleton() {
  const isCompact = useSidebarCompact();

  return (
    <View style={[styles.row, isCompact && styles.rowCompact]}>
      <LoadingSkeleton width={18} height={18} borderRadius={5} />
      {!isCompact && <LoadingSkeleton width="60%" height={14} borderRadius={5} />}
    </View>
  );
}

/** The group separator, drawn at the position `WEB_NAV` declares. */
export function SidebarDivider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.surfaceVariant }]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    height: 40,
  },
  rowCompact: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.two,
  },
});
