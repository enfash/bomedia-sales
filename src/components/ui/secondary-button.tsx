import React from 'react';
import { Button, ButtonProps } from 'react-native-paper';
import { StyleSheet } from 'react-native';

export interface SecondaryButtonProps extends Omit<ButtonProps, 'mode'> {
  mode?: 'outlined' | 'text';
}

/**
 * @description Secondary action button for alternate actions. Wraps React Native Paper's Button.
 * @props SecondaryButtonProps (inherits Paper Button props, with restricted modes)
 * @example
 * <SecondaryButton mode="text" onPress={handleCancel}>
 *   Cancel
 * </SecondaryButton>
 * @variants 'outlined' (default), 'text'
 * @accessibility 
 * - Standard button role.
 * - Outlined or transparent background, lower visual priority than PrimaryButton.
 */
export function SecondaryButton({ mode = 'outlined', ...props }: SecondaryButtonProps) {
  return (
    <Button
      mode={mode}
      style={[styles.button, props.style]}
      contentStyle={[styles.content, props.contentStyle]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
  },
  content: {
    height: 48,
  },
});
