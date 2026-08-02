import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import Feather from '@expo/vector-icons/Feather';
import { Stack, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CustomSidebar } from '@/components/app-tabs.web';
import { ActivityDrawer } from '@/components/dashboard/activity-drawer';
import { CommandPalette } from '@/components/dashboard/command-palette';
import {
  SidebarDivider,
  SidebarNavItem,
  SidebarNavItemSkeleton,
} from '@/components/sidebar-nav-item';
import { WebTopBar } from '@/components/web-top-bar';
import { WEB_NAV, WEB_NAV_ADMIN_COUNT } from '@/constants/web-nav';
import { useAdminGate } from '@/hooks/use-admin-gate';

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
 * keeps the sidebar chrome identical rather than forked.
 *
 * These routes carry a native stack header (title + back arrow), which is right
 * on a phone but would sit ABOVE the web top bar — two stacked headers, and the
 * navy bar no longer flush with the top of the window. So the header is hidden
 * on web and its two jobs, the title and the back affordance, are done by the
 * page bar below. The native twin is a passthrough, so mobile is untouched.
 */

export function WebDetailShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const gate = useAdminGate();

  // Admin destinations appear only once the role is known — never on a maybe.
  const items = WEB_NAV.filter((i) => !i.adminOnly || gate === 'allowed');

  // Deep links and hard refreshes land here with no history to pop, so back
  // falls through to the dashboard rather than doing nothing.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.push('/');
  };

  return (
    <View style={[styles.outer, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <WebTopBar />
      <View style={styles.shell}>
        <CustomSidebar>
          {items.map((item) => (
            <React.Fragment key={item.href}>
              <Pressable
                onPress={() => router.push(item.href as Parameters<typeof router.push>[0])}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <SidebarNavItem icon={item.icon} label={item.label} active={pathname === item.href} />
              </Pressable>
              {item.dividerAfter ? <SidebarDivider /> : null}
            </React.Fragment>
          ))}

          {/* Hold the admin block open while the role read is in flight, so the
              sidebar does not grow a second after the page paints. */}
          {gate === 'pending'
            ? Array.from({ length: WEB_NAV_ADMIN_COUNT }).map((_, i) => (
                <SidebarNavItemSkeleton key={`admin-pending-${i}`} />
              ))
            : null}
        </CustomSidebar>

        <View style={styles.main}>
          <View style={[styles.pageBar, { borderBottomColor: theme.outlineVariant }]}>
            <Pressable
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Feather name="chevron-left" size={18} color={theme.onSurfaceVariant} />
              <ThemedText type="small" themeColor="onSurfaceVariant">Back</ThemedText>
            </Pressable>
            {title ? (
              <ThemedText type="small" style={styles.pageTitle}>{title}</ThemedText>
            ) : null}
          </View>

          <View style={styles.pageBody}>{children}</View>
        </View>
      </View>

      {/* The top bar's search and bell dispatch to these, so detail screens
          need their own copies — they are not inside the tabs navigator that
          mounts the pair for the main shell. */}
      <CommandPalette />
      <ActivityDrawer />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' },
  shell: { flex: 1, flexDirection: 'row', minHeight: 0, overflow: 'hidden' },
  main: { flex: 1, flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' },
  /** Replaces the hidden stack header: back affordance + the page's title. */
  pageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    height: 44,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.one,
    paddingRight: Spacing.two,
  },
  pageTitle: { fontWeight: '700' },
  pageBody: { flex: 1, minHeight: 0 },
  pressed: { opacity: 0.7 },
});
