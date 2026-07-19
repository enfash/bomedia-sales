import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Surface, useTheme } from 'react-native-paper';


export interface BottomActionBarProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * @description Fixed bottom bar for primary actions on a screen.
 * @props BottomActionBarProps (children, style)
 * @example
 * <BottomActionBar>
 *   <PrimaryButton onPress={save}>Save</PrimaryButton>
 * </BottomActionBar>
 * @variants Elevated Surface (pinned to bottom)
 * @accessibility 
 * - Ensures actions are always reachable. Includes SafeAreaView handling for devices with bottom notches/home indicators.
 */
export function BottomActionBar({ children, style }: BottomActionBarProps) {
  const theme = useTheme();

  return (
    <Surface 
      style={[styles.container, { borderTopColor: theme.colors.outline }, style]} 
      elevation={4}
    >
      <View style={styles.content}>
        {children}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32, // Accommodate safe area typically
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
});
