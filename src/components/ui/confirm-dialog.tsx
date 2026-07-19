import React from 'react';
import { StyleSheet } from 'react-native';
import { Portal, Dialog, Text } from 'react-native-paper';
import { PrimaryButton } from './primary-button';
import { SecondaryButton } from './secondary-button';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
  isLoading?: boolean;
  confirmButtonColor?: string;
}

/**
 * @description Standardized confirmation dialog for critical or destructive actions.
 * @props ConfirmDialogProps (visible, title, message, onConfirm, onCancel, confirmLabel, cancelLabel, confirmButtonColor)
 * @example
 * <ConfirmDialog 
 *   visible={isDialogVisible} 
 *   title="Delete Record" 
 *   message="Are you sure you want to delete this record?" 
 *   onConfirm={handleDelete} 
 *   onCancel={() => setDialogVisible(false)} 
 * />
 * @variants Dialog Modal
 * @accessibility 
 * - Leverages React Native Paper's Portal and Dialog for native modal accessibility.
 * - Traps focus while visible.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = false,
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel} style={styles.dialog}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{message}</Text>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <SecondaryButton onPress={onCancel} disabled={isLoading}>
            {cancelLabel}
          </SecondaryButton>
          <PrimaryButton 
            onPress={onConfirm} 
            loading={isLoading} 
            disabled={isLoading}
            buttonColor={isDestructive ? '#BA1A1A' : undefined}
          >
            {confirmLabel}
          </PrimaryButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 16,
  },
  actions: {
    gap: 8,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
});
