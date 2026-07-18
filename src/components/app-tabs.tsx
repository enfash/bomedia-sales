import { Tabs } from "expo-router";
import { View, Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, withTiming, useSharedValue, interpolate } from "react-native-reanimated";
import { useEffect } from "react";
import { useWindowDimensions } from "react-native";

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#0066FF',
          boxShadow: 'none', // removes border on iOS
          elevation: 0, // removes border on Android
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home", href: "/" }} />
      <Tabs.Screen name="quote" options={{ title: "Search Quotes", href: "/quote" }} />
      <Tabs.Screen name="new-sales" options={{ title: "New Sale", href: "/new-sales" }} />
      <Tabs.Screen name="board" options={{ title: "Job Board", href: "/board" }} />
      <Tabs.Screen name="records" options={{ title: "Records", href: "/records" }} />
      <Tabs.Screen name="clients" options={{ title: "Clients", href: "/clients" }} />
      <Tabs.Screen name="expenses" options={{ title: "Expenses", href: "/expenses" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", href: "/settings" }} />
    </Tabs>
  );
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  if (isDesktop) return null;
  
  return (
    <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom : 20 }]}>
      <View style={styles.tabBarPill}>
        {state.routes.map((route: any, index: number) => {
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

          let iconName: any = "home";
          let label = "Home";
          
          if (route.name === 'index') { iconName = "home"; label = "Home"; }
          if (route.name === 'quote') { iconName = "file-text"; label = "Quote"; }
          if (route.name === 'new-sales') { iconName = "plus-circle"; label = "New"; }
          if (route.name === 'board') { iconName = "layout"; label = "Board"; }
          if (route.name === 'records') { iconName = "archive"; label = "Records"; }
          if (route.name === 'clients') { iconName = "users"; label = "Clients"; }
          if (route.name === 'expenses') { iconName = "dollar-sign"; label = "Expenses"; }
          if (route.name === 'settings') { iconName = "settings"; label = "Settings"; }

          // Skip routes we don't want in the tab bar
          if (['invoice', '_sitemap', '+not-found'].includes(route.name)) {
            return null;
          }

          return (
            <TabItem 
              key={route.key} 
              isFocused={isFocused} 
              onPress={onPress} 
              iconName={iconName} 
              label={label} 
            />
          );
        })}
      </View>
    </View>
  );
}

const TabItem = ({ isFocused, onPress, iconName, label }: { isFocused: boolean, onPress: () => void, iconName: any, label: string }) => {
  const animatedValue = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    animatedValue.value = withTiming(isFocused ? 1 : 0, { duration: 250 });
  }, [isFocused]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      paddingHorizontal: interpolate(animatedValue.value, [0, 1], [10, 16]),
      backgroundColor: isFocused ? '#FFFFFF' : 'transparent',
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
        <Feather name={iconName} size={22} color={isFocused ? '#0066FF' : 'rgba(255, 255, 255, 0.6)'} />
        <Animated.View style={[{ overflow: 'hidden' }, textStyle]}>
          <Text numberOfLines={1} style={styles.tabLabel}>
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarPill: {
    flexDirection: 'row',
    backgroundColor: '#0066FF',
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
    color: '#0066FF',
    fontWeight: '600',
    fontSize: 14,
  },
});
