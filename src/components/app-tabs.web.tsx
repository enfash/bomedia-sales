import { Feather } from "@expo/vector-icons";
import {
  TabList,
  TabListProps,
  Tabs,
  TabSlot,
  TabTrigger,
  TabTriggerSlotProps,
} from "expo-router/ui";
import { forwardRef } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export default function AppTabs() {
  const theme = useTheme();

  return (
    <Tabs
      style={[styles.dashboardContainer, { backgroundColor: theme.background }]}
    >
      <TabList asChild>
        <CustomSidebar>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="home">Home</TabButton>
          </TabTrigger>
          <TabTrigger name="quote" href="/quote" asChild>
            <TabButton icon="file-text">Quote</TabButton>
          </TabTrigger>
          <TabTrigger name="new-sales" href="/new-sales" asChild>
            <TabButton icon="plus-circle">New Sales</TabButton>
          </TabTrigger>
          <TabTrigger name="board" href="/board" asChild>
            <TabButton icon="layout">Job Board</TabButton>
          </TabTrigger>
          <TabTrigger name="records" href="/records" asChild>
            <TabButton icon="archive">Records</TabButton>
          </TabTrigger>
          <TabTrigger name="clients" href="/clients" asChild>
            <TabButton icon="users">Clients</TabButton>
          </TabTrigger>
          <TabTrigger name="expenses" href="/expenses" asChild>
            <TabButton icon="dollar-sign">Expenses</TabButton>
          </TabTrigger>
          <View style={{ flex: 1 }} />
          <TabTrigger name="settings" href="/settings" asChild>
            <SettingsButton />
          </TabTrigger>
        </CustomSidebar>
      </TabList>

      <TabSlot style={styles.mainContent} />
    </Tabs>
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
          isFocused && { backgroundColor: theme.onSurface + "15" },
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
  const theme = useTheme();
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

      <View {...props} style={styles.tabListContainer}>
        {props.children}
      </View>
    </ThemedView>
  );
}

const SettingsButton = forwardRef((props: any, ref: any) => {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;
  const { style, isFocused, ...restProps } = props;

  return (
    <Pressable
      ref={ref}
      {...restProps}
      style={({ pressed }) =>
        StyleSheet.flatten([
          style,
          styles.externalPressable,
          isCompact && { justifyContent: "center", paddingHorizontal: 0 },
          isFocused && { backgroundColor: theme.onSurface + "15", opacity: 1 },
          pressed && styles.pressed,
        ])
      }
    >
      <Feather
        color={isFocused ? theme.onSurface : theme.onSurfaceVariant}
        name="settings"
        size={20}
      />
      {!isCompact && (
        <ThemedText
          type="small"
          themeColor={isFocused ? "onSurface" : "onSurfaceVariant"}
          style={{ fontWeight: isFocused ? "600" : "normal" }}
        >
          Settings
        </ThemedText>
      )}
    </Pressable>
  );
});

SettingsButton.displayName = 'SettingsButton';

const styles = StyleSheet.create({
  dashboardContainer: {
    flex: 1,
    flexDirection: "row",
    height: "100%", // Web typical viewport height
    overflow: "hidden",
  },
  sidebarContainer: {
    width: 250,
    height: "100%",
    padding: Spacing.four,
    borderRightWidth: 1,
    flexDirection: "column",
    transitionDuration: "0.2s", // slight transition for smooth collapse on web
  },
  sidebarContainerCompact: {
    width: 80,
    paddingHorizontal: Spacing.two,
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    marginBottom: Spacing.six,
    paddingHorizontal: Spacing.two,
    height: 48,
  },
  tabListContainer: {
    flex: 1,
    flexDirection: "column",
    gap: Spacing.two,
  },
  mainContent: {
    flex: 1,
    height: "100%",
    overflow: "hidden", // scrolling handled by screens inside TabSlot
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  externalPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    opacity: 0.7,
  },
});
