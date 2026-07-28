// Side-effect import: silences a benign react-native-paper useNativeDriver
// warning on web. Must run before any component mounts.
import "@/lib/suppress-web-warnings";

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, Text, useColorScheme, View } from "react-native";
import { PaperProvider } from 'react-native-paper';

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { SignInScreen } from "@/components/auth/sign-in-screen";
import { AuthProvider, useAuth } from "@/context/auth-context";
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
      <Stack.Screen name="activity" options={{ title: 'Activity' }} />
    </Stack>
  );
}

/**
 * Auth gate: nothing in the app renders until a user is signed in. While the
 * first auth check runs we show a themed spinner; unauthenticated users get the
 * sign-in screen; only signed-in users reach the app's navigator.
 */
function AuthGate() {
  const { user, initializing } = useAuth();
  const theme = useTheme();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!user) {
    return <SignInScreen />;
  }

  // SettingsProvider (and everything that reads Firebase) mounts ONLY when
  // authenticated. If it subscribed before sign-in, the deny-all rules reject
  // the read and Firebase permanently cancels that listener, so settings would
  // never load even after signing in.
  return (
    <SettingsProvider>
      <RootStack />
    </SettingsProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const paperTheme = usePaperTheme();

  return (
    <PaperProvider theme={paperTheme}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <AnimatedSplashOverlay />
          <AuthGate />
        </AuthProvider>
      </ThemeProvider>
    </PaperProvider>
  );
}
