import { Feather } from "@expo/vector-icons";
import {
    TabList,
    TabListProps,
    Tabs,
    TabSlot,
    TabTrigger,
    TabTriggerSlotProps,
} from "expo-router/ui";
import {
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from "react-native";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

import { ActivityDrawer, OPEN_ACTIVITY_DRAWER_EVENT } from "@/components/dashboard/activity-drawer";
import { CommandPalette, OPEN_COMMAND_PALETTE_EVENT } from "@/components/dashboard/command-palette";
import { AccountSection } from "@/components/user/account-section";
import { UserAvatar } from "@/components/user/user-avatar";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/auth-context";
import { useActivity } from "@/hooks/use-activity";
import { useTheme } from "@/hooks/use-theme";
import { withAlpha } from "@/utils/color";

/**
 * Web/desktop navigation. Desktop has room for every destination, so the
 * sidebar lists all eight — the four daily-use tabs on top, then the secondary
 * destinations (the ones behind "More" on mobile) below a divider.
 */
export default function AppTabs() {
  const theme = useTheme();
  const { isAdmin } = useAuth();

  return (
    <>
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
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="home">Home</TabButton>
          </TabTrigger>
          <TabTrigger name="quote" href="/quote" asChild>
            <TabButton icon="file-text">Quotes</TabButton>
          </TabTrigger>
          <TabTrigger name="new-sales" href="/new-sales" asChild>
            <TabButton icon="plus-circle">New Sale</TabButton>
          </TabTrigger>
          <TabTrigger name="records" href="/records" asChild>
            <TabButton icon="archive">Records</TabButton>
          </TabTrigger>

          <View style={[styles.divider, { backgroundColor: theme.surfaceVariant }]} />

          <TabTrigger name="board" href="/board" asChild>
            <TabButton icon="layout">Production Board</TabButton>
          </TabTrigger>
          <TabTrigger name="clients" href="/clients" asChild>
            <TabButton icon="users">Clients</TabButton>
          </TabTrigger>
          <TabTrigger name="expenses" href="/expenses" asChild>
            <TabButton icon="dollar-sign">Expenses</TabButton>
          </TabTrigger>

          {/* Admin-only destinations. The parser recurses into Fragments, so a
              gated <>…</> keeps these as valid direct TabList children. */}
          {isAdmin ? (
            <>
              <TabTrigger name="analytics" href="/analytics" asChild>
                <TabButton icon="bar-chart-2">Analytics</TabButton>
              </TabTrigger>
              <TabTrigger name="settings" href="/settings" asChild>
                <TabButton icon="settings">Settings</TabButton>
              </TabTrigger>
              {/* Activity is a root-stack route (not a tab), so it's a plain
                  navigation button rather than a TabTrigger. Non-trigger children
                  are fine here — the divider above is one too. */}
              {/* Daily Cash is a root-stack route, not a tab, so it navigates
                  directly rather than through a TabTrigger. */}
              <SidebarCashButton />
              <SidebarActivityButton />
            </>
          ) : null}
        </CustomSidebar>
      </TabList>

      <TabSlot style={styles.mainContent} />
    </Tabs>
    {/* Global ⌘K command palette overlay (web power-user polish). */}
    <CommandPalette />
    {/* Activity feed as a right-side drawer (admin), opened from the sidebar bell. */}
    <ActivityDrawer />
    </>
  );
}

/**
 * Sidebar nav button for the admin Activity feed. Unlike the tab destinations
 * it pushes a root-stack route and carries an unread badge.
 */
/**
 * Daily Cash reconciliation — a full sidebar destination on web, where the
 * owner actually counts a drawer, rather than a bottom-tab slot on mobile.
 */
function SidebarCashButton() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  const go = () => {
    if (typeof window !== "undefined") window.location.assign("/cash");
  };

  return (
    <Pressable onPress={go} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type="surface"
        style={[styles.tabButtonView, isCompact && { justifyContent: "center", paddingHorizontal: 0 }]}
      >
        <Feather name="dollar-sign" size={isCompact ? 20 : 18} color={theme.onSurfaceVariant} />
        {!isCompact && (
          <ThemedText type="default" themeColor="onSurfaceVariant" style={{ flex: 1 }}>
            Daily Cash
          </ThemedText>
        )}
      </ThemedView>
    </Pressable>
  );
}

function SidebarActivityButton() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;
  const { unreadCount } = useActivity();
  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  const openDrawer = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_ACTIVITY_DRAWER_EVENT));
  };

  return (
    <Pressable onPress={openDrawer} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type="surface"
        style={[styles.tabButtonView, isCompact && { justifyContent: "center", paddingHorizontal: 0 }]}
      >
        <View>
          <Feather name="bell" size={isCompact ? 20 : 18} color={theme.onSurfaceVariant} />
          {unreadCount > 0 && isCompact && (
            <View style={[styles.dot, { backgroundColor: theme.error, borderColor: theme.surface }]} />
          )}
        </View>
        {!isCompact && (
          <>
            <ThemedText type="default" themeColor="onSurfaceVariant" style={{ flex: 1 }}>
              Activity
            </ThemedText>
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: theme.error }]}>
                <ThemedText style={{ color: theme.onError, fontSize: 11, fontWeight: "700" }}>{badge}</ThemedText>
              </View>
            )}
          </>
        )}
      </ThemedView>
    </Pressable>
  );
}

export function TabButton({
  children,
  isFocused,
  icon,
  ...props
}: TabTriggerSlotProps & { icon?: any }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type="surface"
        style={[
          styles.tabButtonView,
          isCompact && { justifyContent: "center", paddingHorizontal: 0 },
          isFocused && { backgroundColor: withAlpha(theme.onSurface, 0.1) },
        ]}
      >
        {icon && (
          <Feather
            name={icon}
            size={isCompact ? 20 : 18}
            color={isFocused ? theme.onSurface : theme.onSurfaceVariant}
          />
        )}
        {!isCompact && (
          <ThemedText
            type="default"
            style={{ fontWeight: isFocused ? "600" : "normal" }}
            themeColor={isFocused ? "onSurface" : "onSurfaceVariant"}
          >
            {children}
          </ThemedText>
        )}
      </ThemedView>
    </Pressable>
  );
}

export function CustomSidebar(props: TabListProps) {
  const { children, ...rest } = props;
  const theme = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  return (
    <ThemedView
      type="surface"
      style={[
        styles.sidebarContainer,
        isCompact && styles.sidebarContainerCompact,
        { borderRightColor: theme.surfaceVariant },
      ]}
    >
      <View
        style={[
          styles.brandContainer,
          isCompact && { justifyContent: "center", paddingHorizontal: 0 },
        ]}
      >
        {isCompact ? (
          <Image
            source={require("@/assets/images/bomedia-icon.png")}
            style={{ width: 32, height: 32 }}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={require("@/assets/images/bomedia-logo.png")}
            style={{ width: 140, height: 40 }}
            resizeMode="contain"
          />
        )}
      </View>

      <Pressable
        onPress={() => {
          if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
        }}
        style={({ pressed }) => [
          styles.searchBtn,
          { borderColor: theme.outlineVariant, backgroundColor: withAlpha(theme.surfaceVariant, 0.35) },
          isCompact && { justifyContent: "center", paddingHorizontal: 0 },
          pressed && styles.pressed,
        ]}
      >
        <Feather name="search" size={16} color={theme.onSurfaceVariant} />
        {!isCompact && (
          <>
            <ThemedText type="small" themeColor="onSurfaceVariant" style={{ flex: 1 }}>Search…</ThemedText>
            <View style={[styles.kbd, { borderColor: theme.outlineVariant }]}>
              <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontSize: 11 }}>⌘K</ThemedText>
            </View>
          </>
        )}
      </Pressable>

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
  dashboardContainer: {
    flex: 1,
    flexDirection: "row",
    height: "100%",
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
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    marginBottom: Spacing.four,
    paddingHorizontal: Spacing.two,
    height: 40,
  },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    height: 38,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Spacing.two,
    marginBottom: Spacing.three,
  },
  kbd: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
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
  divider: {
    height: 1,
    marginVertical: Spacing.two,
  },
  mainContent: {
    flex: 1,
    height: "100%",
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.7,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  tabButtonView: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
});
