import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import Feather from '@expo/vector-icons/Feather';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CustomSidebar } from '@/components/app-tabs.web';
import { WEB_NAV } from '@/constants/web-nav';

/**
 * Sidebar shell for root-stack detail screens on WEB.
 *
 * The problem it solves: `transaction/[id]`, `cash` and friends live in the
 * ROOT stack, not the `(tabs)` group — deliberately, so that on mobile they
 * push over the tab bar with correct back behaviour (see the note in
 * `(tabs)/_layout.tsx`). But the sidebar is rendered by the tabs navigator, so
 * on web those screens covered the whole window and the sidebar vanished.
 *
 * Moving them into `(tabs)` would fix web and break mobile. Instead this
 * reproduces the sidebar chrome around them on web only.
 *
 * `CustomSidebar` itself needs no navigator context — only the `TabTrigger`
 * children inside it do. So it is reused here with plain router links, which
 * keeps the brand, search and account chrome identical rather than forked.
 */

export function WebDetailShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  const items = WEB_NAV.filter((i) => !i.adminOnly || isAdmin);

  return (
    <View style={[styles.shell, { backgroundColor: theme.background }]}>
      <CustomSidebar>
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Pressable
              key={item.href}
              onPress={() => router.push(item.href as Parameters<typeof router.push>[0])}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <ThemedView
                type="surface"
                style={[
                  styles.navItem,
                  isCompact && { justifyContent: 'center', paddingHorizontal: 0 },
                  active && { backgroundColor: theme.surfaceVariant },
                ]}
              >
                <Feather
                  name={item.icon}
                  size={isCompact ? 20 : 18}
                  color={active ? theme.primary : theme.onSurfaceVariant}
                />
                {!isCompact && (
                  <ThemedText
                    type="default"
                    themeColor={active ? undefined : 'onSurfaceVariant'}
                    style={{ flex: 1, color: active ? theme.primary : undefined }}
                  >
                    {item.label}
                  </ThemedText>
                )}
              </ThemedView>
            </Pressable>
          );
        })}
      </CustomSidebar>

      <View style={styles.main}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', height: '100%', overflow: 'hidden' },
  main: { flex: 1, height: '100%', overflow: 'hidden' },
  pressed: { opacity: 0.7 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
});
