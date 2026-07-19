import React from 'react';
import { IconButton as PaperIconButton, IconButtonProps } from 'react-native-paper';

export type ThemedIconButtonProps = IconButtonProps;

/**
 * @description Themed icon button wrapper around React Native Paper's IconButton.
 * @props ThemedIconButtonProps (inherits standard Paper IconButton props)
 * @example
 * <IconButton icon="camera" size={24} onPress={() => {}} />
 * @variants N/A (standard Paper variants)
 * @accessibility 
 * - Always provide an `accessibilityLabel` when using an icon without visible text.
 * - Ensures 48x48 touch target area.
 */
export function IconButton(props: ThemedIconButtonProps) {
  return (
    <PaperIconButton
      {...props}
    />
  );
}
