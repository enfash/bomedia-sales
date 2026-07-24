import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { Text, useColorScheme } from "react-native";
import { PaperProvider } from 'react-native-paper';

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { SettingsProvider } from "@/context/settings-context";
import { usePaperTheme } from "@/hooks/use-paper-theme";
import { useTheme } from "@/hooks/use-theme";

SplashScreen.preventAutoHideAsync();

// Globally disable font scaling so the phone's accessibility
// "Large Text" setting never breaks the app layout.
// Individual components can still opt-in via allowFontScaling={true}.
if ((Text as any).defaultProps == null) (Text as any).defaultProps = {};
(Text as any).defaultProps.allowFontScaling = false;

function RootStack() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.primary,
        headerTitleStyle: { color: theme.onSurface, fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      {/* The tab navigator — owns its own chrome, so no stack header. */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* Detail screens push over the tabs with a real back button. */}
      <Stack.Screen name="transaction/[id]" options={{ title: 'Transaction Details' }} />
      <Stack.Screen name="invoice" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const paperTheme = usePaperTheme();

  return (
    <PaperProvider theme={paperTheme}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <SettingsProvider>
          <AnimatedSplashOverlay />
          <RootStack />
        </SettingsProvider>
      </ThemeProvider>
    </PaperProvider>
  );
}
