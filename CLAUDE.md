## UI stack — fixed decisions

- React Native 0.86 + Expo 57, react-native-paper (MD3). This is settled.
  Do NOT suggest migrating to NativeWind, Tamagui, Restyle, Unistyles, or
  @expo/ui components. Work with Paper, not around it.
- Design tokens live in src/constants/theme.ts and are applied through
  src/hooks/use-paper-theme.ts. That hook is the seam — extend the Paper
  theme there rather than restyling components individually.
- Emit React Native StyleSheet objects, never CSS. No box-shadow, no rem,
  no cascade, no descendant selectors.
- Shadows: shadowColor/shadowOffset/shadowOpacity/shadowRadius plus Android
  elevation, or MD3 elevation levels. Shadows are deliberately reduced 45%
  globally via theme colors.shadow — keep them subtle.
- Spacing and type scales apply as unitless numbers.
- One codebase serves native and web. Desktop layouts use .web.tsx
  siblings (Expo Router resolves these automatically). Do not add a
  separate web framework.
