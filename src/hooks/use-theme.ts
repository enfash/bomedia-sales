/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useTheme as usePaperTheme } from 'react-native-paper';

export function useTheme() {
  return usePaperTheme().colors;
}
