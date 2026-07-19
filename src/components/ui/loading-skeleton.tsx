import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export interface LoadingSkeletonProps {
  style?: StyleProp<ViewStyle>;
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
}

/**
 * @description Placeholder component that leverages an animated fading loop to simulate loading content.
 * @props LoadingSkeletonProps (style, width, height, borderRadius)
 * @example
 * <LoadingSkeleton width="100%" height={24} />
 * @variants Looping opacity animation
 * @accessibility 
 * - Skeletons represent content that is loading; consider combining with `aria-busy` or `accessibilityState={{ busy: true }}` on the parent container.
 */
export function LoadingSkeleton({
  style,
  width = '100%',
  height = 20,
  borderRadius = 8,
}: LoadingSkeletonProps) {
  const [fadeAnim] = useState(() => new Animated.Value(0.3));
  const theme = useTheme();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fadeAnim]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.outline || '#E5E7EB',
          opacity: fadeAnim,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
  },
});
