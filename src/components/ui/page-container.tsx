import { BottomTabInset, MaxContentWidth, Spacing, WebContentMaxWidth, WebContentPaddingH } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import React, { forwardRef } from 'react';
import { Platform, ScrollView, ScrollViewProps, StyleSheet, View, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  // On web every page shares one wide, centered content column; native keeps
  // the narrow reading column and only pads horizontally when asked.
  const horizontalPad = isWeb ? WebContentPaddingH : (padHorizontalMobile ? Spacing.four : 0);

  return {
    contentStyle: [
      styles.contentContainer,
      {
        maxWidth: isWeb ? WebContentMaxWidth : MaxContentWidth,
        paddingTop: isWeb ? Spacing.six : insets.top + Spacing.two,
        paddingLeft: insets.left + horizontalPad,
        paddingRight: insets.right + horizontalPad,
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

PageContainer.displayName = 'PageContainer';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    alignSelf: 'center',
    width: '100%',
  },
});
