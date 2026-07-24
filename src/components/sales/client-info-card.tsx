import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, View, Pressable, StyleSheet } from 'react-native';
import { Surface } from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedTextInput } from '@/components/ui/themed-text-input';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

export interface ClientData {
  date: Date;
  clientName: string;
  contact: string;
}

export interface ClientInfoRef {
  getData: () => ClientData;
  validate: () => boolean;
  reset: () => void;
}

export const ClientInfoCard = React.memo(
  forwardRef<ClientInfoRef>((_, ref) => {
    const theme = useTheme();

    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [clientName, setClientName] = useState('');
    const [contact, setContact] = useState('');

    const contactRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      getData: () => ({
        date,
        clientName,
        contact,
      }),
      validate: () => {
        if (!clientName.trim()) {
          return false;
        }
        return true;
      },
      reset: () => {
        setClientName('');
        setContact('');
        setDate(new Date());
      },
    }));

    return (
      <Surface elevation={1} style={styles.card}>
        <ThemedText type="smallBold" style={styles.cardHeader}>
          1. Client Information
        </ThemedText>

        <View style={styles.formGroup}>
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>
            Date
          </ThemedText>
          {Platform.OS === 'ios' ? (
            <View style={{ height: 44, justifyContent: 'center', alignItems: 'flex-start' }}>
              <DateTimePicker
                value={date}
                mode="date"
                display="default"
                onValueChange={(event, selectedDate) => {
                  if (selectedDate) setDate(selectedDate);
                }}
              />
            </View>
          ) : (
            <>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.surfaceVariant,
                    justifyContent: 'center',
                  },
                ]}
              >
                <ThemedText style={{ color: theme.onSurface }}>
                  {date.toISOString().split('T')[0]}
                </ThemedText>
              </Pressable>
              {showDatePicker && Platform.OS !== 'web' && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="default"
                  onValueChange={(event, selectedDate) => {
                    setShowDatePicker(false);
                    if (selectedDate) setDate(selectedDate);
                  }}
                  onDismiss={() => setShowDatePicker(false)}
                />
              )}
            </>
          )}
        </View>

        <View style={styles.formGroup}>
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>
            Client / Company Name
          </ThemedText>
          <ThemedTextInput
            placeholder="Enter client name"
            value={clientName}
            onChangeText={setClientName}
            returnKeyType="next"
            onSubmitEditing={() => contactRef.current?.focus()}
          />
        </View>

        <View style={styles.formGroup}>
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>
            Contact (Phone / Email)
          </ThemedText>
          <ThemedTextInput
            placeholder="e.g. 08012345678"
            value={contact}
            onChangeText={setContact}
            ref={contactRef}
            returnKeyType="next"
          />
        </View>
      </Surface>
    );
  })
);

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  cardHeader: {
    marginBottom: Spacing.three,
  },
  formGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
});
