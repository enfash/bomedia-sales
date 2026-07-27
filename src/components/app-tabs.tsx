import { MoreMenu, OPEN_MORE_EVENT } from "@/components/more-menu";
import { useActivity } from "@/hooks/use-activity";
import { useMoreBadges } from "@/hooks/use-more-badges";
import { useTheme } from "@/hooks/use-theme";
import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { DeviceEventEmitter, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Icon + short label for each tab route. Four daily-use destinations only —
 *  everything else lives in the "More" side menu (VISION: Simple/Fast). */
const TAB_META: Record<string, { icon: any; label: string }> = {
  index: { icon: 'home', label: 'Home' },
  quote: { icon: 'file-text', label: 'Quote' },
  'new-sales': { icon: 'plus-circle', label: 'New' },
  records: { icon: 'archive', label: 'Records' },
};

export default function AppTabs() {
  return (
    <Tabs
      // Back returns to the previously-visited tab, not always Home.
      backBehavior="history"
      screenOptions={{
        // Screens render their own in-page titles, so the redundant top bar is
        // hidden — keeps navigation calm and on-brand (VISION: Beautiful/Simple).
        headerShown: false,
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      {/* Four daily-use tabs shown in the bar. */}
      <Tabs.Screen name="index" options={{ title: "Home", href: "/" }} />
      <Tabs.Screen name="quote" options={{ title: "Quotes", href: "/quote" }} />
      <Tabs.Screen name="new-sales" options={{ title: "New Sale", href: "/new-sales" }} />
      <Tabs.Screen name="records" options={{ title: "Records", href: "/records" }} />
      {/* Secondary destinations — reached from the "More" menu, not the bar. */}
      <Tabs.Screen name="board" options={{ title: "Production Board", href: "/board" }} />
      <Tabs.Screen name="clients" options={{ title: "Clients", href: "/clients" }} />
      <Tabs.Screen name="expenses" options={{ title: "Expenses", href: "/expenses" }} />
      {/* Web-only surface — hidden from the mobile bar (reachable by URL, shows a stub). */}
      <Tabs.Screen name="analytics" options={{ title: "Analytics", href: null }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", href: "/settings" }} />
    </Tabs>
  );
}

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const badges = useMoreBadges();
  const { unreadCount } = useActivity();
  const [menuOpen, setMenuOpen] = useState(false);

  // Let other surfaces (e.g. the Home-header avatar) open the More menu.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(OPEN_MORE_EVENT, () => setMenuOpen(true));
    return () => sub.remove();
  }, []);

  const currentRouteName = state.routes[state.index]?.name;
  const onSecondaryPage = !TAB_META[currentRouteName];

  return (
    <>
      <View style={[styles.tabBarContainer, { backgroundColor: theme.primary, paddingBottom: insets.bottom > 0 ? insets.bottom : 20 }]}>
        <View style={[styles.tabBarPill, { backgroundColor: theme.primary }]}>
          {state.routes.map((route: any, index: number) => {
            const meta = TAB_META[route.name];
            if (!meta) return null; // secondary route — lives in the More menu

            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TabItem
                key={route.key}
                isFocused={isFocused}
                onPress={onPress}
                iconName={meta.icon}
                label={meta.label}
              />
            );
          })}

          {/* Opens the side menu of secondary destinations. */}
          <TabItem
            isFocused={menuOpen || onSecondaryPage}
            onPress={() => setMenuOpen(true)}
            iconName="menu"
            label="More"
            showDot={badges.hasAny || unreadCount > 0}
          />
        </View>
      </View>

      <MoreMenu visible={menuOpen} onClose={() => setMenuOpen(false)} counts={badges.counts} />
    </>
  );
}

const TabItem = ({ isFocused, onPress, iconName, label, showDot }: { isFocused: boolean, onPress: () => void, iconName: any, label: string, showDot?: boolean }) => {
  const theme = useTheme();
  const animatedValue = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    animatedValue.value = withTiming(isFocused ? 1 : 0, { duration: 250 });
  }, [animatedValue, isFocused]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      paddingHorizontal: interpolate(animatedValue.value, [0, 1], [10, 16]),
      backgroundColor: isFocused ? theme.onPrimary : 'transparent',
    };
  });

  const textStyle = useAnimatedStyle(() => {
    return {
      width: interpolate(animatedValue.value, [0, 1], [0, 52]),
      opacity: animatedValue.value,
      marginLeft: interpolate(animatedValue.value, [0, 1], [0, 6]),
    };
  });

  return (
    <Pressable onPress={onPress} style={styles.tabButton}>
      <Animated.View style={[styles.tabItem, animatedStyle]}>
        <View>
          <Feather name={iconName} size={22} color={isFocused ? theme.primary : 'rgba(255, 255, 255, 0.6)'} />
          {showDot && <View style={[styles.dot, { backgroundColor: theme.onPrimary, borderColor: theme.primary }]} />}
        </View>
        <Animated.View style={[{ overflow: 'hidden' }, textStyle]}>
          <Text numberOfLines={1} style={[styles.tabLabel, { color: theme.primary }]}>
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarPill: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    maxWidth: 600,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 24,
  },
  tabLabel: {
    fontWeight: '600',
    fontSize: 14,
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
});
