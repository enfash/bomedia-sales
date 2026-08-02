import { useRouter } from "expo-router";
import {
    TabList,
    TabListProps,
    Tabs,
    TabSlot,
    TabTrigger,
    TabTriggerSlotProps,
} from "expo-router/ui";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";

import { ThemedView } from "./themed-view";

import { ActivityDrawer } from "@/components/dashboard/activity-drawer";
import {
    SidebarDivider,
    SidebarNavItem,
    SidebarNavItemSkeleton,
    useSidebarCompact,
} from "@/components/sidebar-nav-item";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { AccountSection } from "@/components/user/account-section";
import { UserAvatar } from "@/components/user/user-avatar";
import { WebTopBar } from "@/components/web-top-bar";
import { Spacing } from "@/constants/theme";
import { WEB_NAV_ADMIN_COUNT, webNavItem } from "@/constants/web-nav";
import { useAuth } from "@/context/auth-context";
import { useAdminGate } from "@/hooks/use-admin-gate";
import { useTheme } from "@/hooks/use-theme";

/**
 * Web/desktop navigation. Desktop has room for every destination, so the
 * sidebar lists all eight — the four daily-use tabs on top, then the secondary
 * destinations (the ones behind "More" on mobile) below a divider.
 *
 * The whole thing sits under the full-width `WebTopBar`, which owns the brand
 * mark, the quick search and the activity bell — hence their absence here.
 */
export default function AppTabs() {
  const theme = useTheme();
  const gate = useAdminGate();

  return (
    <>
    <View style={styles.shell}>
      <WebTopBar />
      <Tabs style={[styles.dashboardContainer, { backgroundColor: theme.background }]}>
      {/*
       * TabTriggers must be *direct* children of the TabList (CustomSidebar).
       * expo-router's trigger parser only recurses into Fragments and nested
       * TabLists — never into <View> wrappers — so grouping the triggers in
       * <View>s silently drops those routes and leaves the buttons dead.
       * Grouping is done via spacing + plain divider/spacer siblings instead.
       */}
      <TabList asChild>
        <CustomSidebar>
          {/* Every label and icon comes from WEB_NAV — the detail-screen
              sidebar reads the same list, so the two cannot drift. */}
          <TabTrigger name="index" href="/" asChild>
            <TabButton href="/" />
          </TabTrigger>
          <TabTrigger name="quote" href="/quote" asChild>
            <TabButton href="/quote" />
          </TabTrigger>
          <TabTrigger name="new-sales" href="/new-sales" asChild>
            <TabButton href="/new-sales" />
          </TabTrigger>
          <TabTrigger name="records" href="/records" asChild>
            <TabButton href="/records" />
          </TabTrigger>

          {/* Position declared by WEB_NAV's `dividerAfter: true` on /records. */}
          <SidebarDivider />

          <TabTrigger name="board" href="/board" asChild>
            <TabButton href="/board" />
          </TabTrigger>
          <TabTrigger name="clients" href="/clients" asChild>
            <TabButton href="/clients" />
          </TabTrigger>
          <TabTrigger name="expenses" href="/expenses" asChild>
            <TabButton href="/expenses" />
          </TabTrigger>

          {/* Admin-only destinations. The parser recurses into Fragments, so a
              gated <>…</> keeps these as valid direct TabList children.
              While the role read is still in flight the block is held open with
              placeholders — otherwise the sidebar grows a second after paint. */}
          {gate === 'pending' ? (
            <>
              {Array.from({ length: WEB_NAV_ADMIN_COUNT }).map((_, i) => (
                <SidebarNavItemSkeleton key={`admin-pending-${i}`} />
              ))}
            </>
          ) : null}
          {gate === 'allowed' ? (
            <>
              <TabTrigger name="analytics" href="/analytics" asChild>
                <TabButton href="/analytics" />
              </TabTrigger>
              <TabTrigger name="settings" href="/settings" asChild>
                <TabButton href="/settings" />
              </TabTrigger>
              {/* Daily Cash is a root-stack route, not a tab, so it navigates
                  directly rather than through a TabTrigger. */}
              <SidebarCashButton />
            </>
          ) : null}
        </CustomSidebar>
      </TabList>

      <TabSlot style={styles.mainContent} />
      </Tabs>
    </View>
    {/* Global ⌘K command palette overlay (web power-user polish). */}
    <CommandPalette />
    {/* Activity feed as a right-side drawer (admin), opened from the top bar bell. */}
    <ActivityDrawer />
    </>
  );
}

/**
 * Daily Cash reconciliation — a full sidebar destination on web, where the
 * owner actually counts a drawer, rather than a bottom-tab slot on mobile.
 *
 * `/cash` is a ROOT-STACK route, so it cannot be a `TabTrigger` — it is not in
 * the `(tabs)` group, and wiring it as one silently breaks it (guarded by
 * web-nav.test.ts). It can still be pushed by the router though: this used to
 * call `window.location.assign`, which is a document navigation and rebooted
 * the entire app — bundle re-parsed, Firebase re-authenticated, the role read
 * replayed — on every click.
 */
function SidebarCashButton() {
  const router = useRouter();
  const item = webNavItem("/cash");

  if (!item) return null;

  return (
    <Pressable onPress={() => router.push("/cash")} style={({ pressed }) => pressed && styles.pressed}>
      <SidebarNavItem icon={item.icon} label={item.label} />
    </Pressable>
  );
}

/**
 * A sidebar destination inside a `TabTrigger`. It takes the same `href` as the
 * trigger and reads its label and icon from WEB_NAV, so the tabs shell states
 * each destination's identity exactly once — in the list every other sidebar
 * reads too.
 */
export function TabButton({
  href,
  isFocused,
  ...props
}: TabTriggerSlotProps & { href: string }) {
  const item = webNavItem(href);

  // Unreachable in practice: web-nav.test.ts fails if a trigger's href is not
  // declared in WEB_NAV.
  if (!item) return null;

  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <SidebarNavItem icon={item.icon} label={item.label} active={!!isFocused} />
    </Pressable>
  );
}

export function CustomSidebar(props: TabListProps) {
  const { children, ...rest } = props;
  const theme = useTheme();
  const { user } = useAuth();
  const isCompact = useSidebarCompact();

  return (
    <ThemedView
      type="surface"
      style={[
        styles.sidebarContainer,
        isCompact && styles.sidebarContainerCompact,
        { borderRightColor: theme.surfaceVariant },
      ]}
    >
      <ScrollView
        {...rest}
        style={styles.navArea}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      {isCompact ? (
        <View style={styles.compactAccount}>
          <UserAvatar name={user?.displayName} email={user?.email} size={36} />
        </View>
      ) : (
        <AccountSection />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  /** Column wrapper: the top bar, then the sidebar + content row below it. */
  shell: {
    flex: 1,
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  dashboardContainer: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    overflow: "hidden",
  },
  sidebarContainer: {
    width: 220,
    height: "100%",
    padding: Spacing.three,
    borderRightWidth: 1,
    flexDirection: "column",
    transitionDuration: "0.2s",
  },
  sidebarContainerCompact: {
    width: 76,
    paddingHorizontal: Spacing.two,
  },
  navArea: {
    flex: 1,
    minHeight: 0,
  },
  navContent: {
    flexDirection: "column",
    gap: Spacing.half,
    paddingBottom: Spacing.two,
  },
  compactAccount: {
    alignItems: "center",
    paddingTop: Spacing.three,
  },
  mainContent: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.7,
  },
});
