import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { MD3Theme } from 'react-native-paper';
import { Fonts, FontSize } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code' | 'defaultSemiBold' | 'caption';
  themeColor?: keyof MD3Theme['colors'];
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      allowFontScaling={false}
      style={[
        { color: (theme as any)[themeColor ?? 'onSurface'] as string },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        type === 'defaultSemiBold' && styles.defaultSemiBold,
        type === 'caption' && styles.caption,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: FontSize.body,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: FontSize.body,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: FontSize.medium,
    lineHeight: 24,
    fontWeight: 500,
  },
  defaultSemiBold: {
    fontSize: FontSize.medium,
    lineHeight: 24,
    fontWeight: 600,
  },
  title: {
    fontSize: FontSize.jumbo,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: FontSize.huge,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: FontSize.body,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: FontSize.body,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: FontSize.small,
  },
  caption: {
    fontSize: FontSize.caption,
    lineHeight: 20,
  },
});
