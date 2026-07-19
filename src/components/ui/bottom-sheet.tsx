import React from 'react';
import { StyleSheet, View, StyleProp, ViewStyle, ScrollView } from 'react-native';
import { Modal, Portal, Text, useTheme } from 'react-native-paper';


export interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * @description A bottom-anchored modal for displaying temporary content or forms.
 * @props BottomSheetProps (visible, onDismiss, children, style)
 * @example
 * <BottomSheet visible={showSheet} onDismiss={() => setShowSheet(false)}>
 *   <Text>Sheet Content</Text>
 * </BottomSheet>
 * @variants Bottom-anchored Modal
 * @accessibility 
 * - Uses React Native Paper's Modal.
 * - Background overlay provides click-to-dismiss functionality.
 */
export function BottomSheet({
  visible,
  onDismiss,
  title,
  children,
  contentStyle,
}: BottomSheetProps) {
  const theme = useTheme();

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }, contentStyle]}
        style={styles.modal}
      >
        <View style={styles.handleContainer}>
          <View style={[styles.handle, { backgroundColor: theme.colors.outline }]} />
        </View>
        
        {title && (
          <Text variant="titleLarge" style={styles.title}>
            {title}
          </Text>
        )}
        
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 12,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
  },
  handleContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  title: {
    fontWeight: '600',
    marginBottom: 16,
  },
  scrollView: {
    flexGrow: 0,
  },
});
