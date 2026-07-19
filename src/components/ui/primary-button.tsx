import React from 'react';
import { Button, ButtonProps } from 'react-native-paper';
import { StyleSheet } from 'react-native';

export type PrimaryButtonProps = Omit<ButtonProps, 'mode'>;

/**
 * @description Primary action button. Wraps React Native Paper's Button with mode="contained".
 * @props PrimaryButtonProps (inherits all standard Paper Button props except 'mode')
 * @example
 * <PrimaryButton onPress={handleSave} loading={isSaving}>
 *   Save Record
 * </PrimaryButton>
 * @variants Contained only.
 * @accessibility 
 * - Standard button role. 
 * - High contrast background using theme.primary.
 * - Respects standard minimum touch target size.
 */
export function PrimaryButton(props: PrimaryButtonProps) {
  return (
    <Button
      mode="contained"
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
