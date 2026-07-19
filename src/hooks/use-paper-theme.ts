import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export function usePaperTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const baseTheme = isDark ? MD3DarkTheme : MD3LightTheme;
  const brandColors = Colors.light;

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: brandColors.primary,
      onPrimary: brandColors.onPrimary,
      primaryContainer: brandColors.primaryContainer,
      // For dark mode, rely entirely on inherited MD3 colours for surfaces and text
      // to avoid hardcoding dark mode hexes, per rules.
      background: isDark ? baseTheme.colors.background : brandColors.background,
      surface: isDark ? baseTheme.colors.surface : brandColors.surface,
      surfaceVariant: isDark ? baseTheme.colors.surfaceVariant : brandColors.surfaceLow,
      error: isDark ? baseTheme.colors.error : brandColors.error,
      errorContainer: isDark ? baseTheme.colors.errorContainer : brandColors.errorContainer,
      outline: isDark ? baseTheme.colors.outline : brandColors.outline,
      outlineVariant: isDark ? baseTheme.colors.outlineVariant : brandColors.outlineVariant,
      onSurface: isDark ? baseTheme.colors.onSurface : brandColors.textPrimary,
      onSurfaceVariant: isDark ? baseTheme.colors.onSurfaceVariant : brandColors.textSecondary,
      shadow: 'rgba(0,0,0,0.55)', // Reduce shadows globally by 45%
      elevation: {
        ...baseTheme.colors.elevation,
        level0: 'transparent',
        level1: isDark ? baseTheme.colors.elevation.level1 : brandColors.surfaceLowest,
        level2: isDark ? baseTheme.colors.elevation.level2 : brandColors.surfaceLow, 
      }
    },
  };
}
