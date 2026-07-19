import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { MD3Theme } from 'react-native-paper';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: keyof MD3Theme['colors'];
};

export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();

  return <View style={[{ backgroundColor: (theme as any)[type ?? 'background'] as string }, style]} {...otherProps} />;
}
