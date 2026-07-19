import React, { forwardRef } from 'react';
import { ScrollView, View, Platform, StyleSheet, ScrollViewProps, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Spacing, BottomTabInset } from '@/constants/theme';

export interface PageContainerProps extends ScrollViewProps {
  children: React.ReactNode;
  /** Whether the page should scroll. Default is true. */
  scroll?: boolean;
  /** Inner content style */
  contentContainerStyle?: any;
  /** Extra bottom padding if there is a sticky footer. Default is 0. */
  footerHeight?: number;
  /** If true, adds horizontal padding on mobile. If false (default), content fits 100% width on phone. */
  padHorizontalMobile?: boolean; 
}

export function usePageContainerStyles(padHorizontalMobile = false, footerHeight = 0) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const isWeb = Platform.OS === 'web';
  const shouldPadHorizontal = isWeb || padHorizontalMobile;

  return {
    contentStyle: [
      styles.contentContainer,
      {
        paddingTop: isWeb ? Spacing.six : insets.top + Spacing.two,
        paddingLeft: insets.left + (shouldPadHorizontal ? Spacing.four : 0),
        paddingRight: insets.right + (shouldPadHorizontal ? Spacing.four : 0),
        paddingBottom: insets.bottom + BottomTabInset + Spacing.four + footerHeight,
      }
    ],
    theme,
  };
}

export const PageContainer = forwardRef<ScrollView, PageContainerProps>(({ 
  children, 
  scroll = true, 
  contentContainerStyle, 
  footerHeight = 0,
  padHorizontalMobile = false,
  style, 
  ...rest 
}, ref) => {
  const { contentStyle, theme } = usePageContainerStyles(padHorizontalMobile, footerHeight);

  const finalContentStyle = [contentStyle, contentContainerStyle];

  if (scroll) {
    return (
      <ScrollView
        ref={ref}
        style={[styles.container, { backgroundColor: theme.background }, style]}
        contentContainerStyle={finalContentStyle}
        keyboardShouldPersistTaps="handled"
        {...rest}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }, style]} {...rest as ViewProps}>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
});
