import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { PaperProvider } from 'react-native-paper';
import * as SplashScreen from "expo-splash-screen";
import { Text, useColorScheme, View } from "react-native";
import { useWindowDimensions } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import AppTabs from "@/components/app-tabs";
import { SettingsProvider } from "@/context/settings-context";
import DesktopSidebar from "@/components/desktop-sidebar";
import { useTheme } from "@/hooks/use-theme";
import { usePaperTheme } from "@/hooks/use-paper-theme";

SplashScreen.preventAutoHideAsync();

// Globally disable font scaling so the phone's accessibility
// "Large Text" setting never breaks the app layout.
// Individual components can still opt-in via allowFontScaling={true}.
if ((Text as any).defaultProps == null) (Text as any).defaultProps = {};
(Text as any).defaultProps.allowFontScaling = false;

function LayoutContent() {
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
  const theme = useTheme();

  return (
    <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column', backgroundColor: theme.background }}>
      <DesktopSidebar />
      <View style={{ flex: 1 }}>
        <AppTabs />
      </View>
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const paperTheme = usePaperTheme();

  return (
    <PaperProvider theme={paperTheme}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <SettingsProvider>
          <AnimatedSplashOverlay />
          <LayoutContent />
        </SettingsProvider>
      </ThemeProvider>
    </PaperProvider>
  );
}
