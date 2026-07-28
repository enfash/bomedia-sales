import React from 'react';
import { TextInput as PaperTextInput, TextInputProps } from 'react-native-paper';
import { StyleSheet, View, Text } from 'react-native';

export interface ThemedTextInputProps extends Omit<TextInputProps, 'mode'> {
  errorText?: string;
}

/**
 * @description Wrapper around React Native Paper's TextInput providing standard styling and error messaging.
 * @props ThemedTextInputProps (inherits Paper TextInputProps + errorText)
 * @example
 * <ThemedTextInput 
 *   label="Email" 
 *   value={email} 
 *   onChangeText={setEmail} 
 *   errorText={emailError} 
 * />
 * @variants Outlined (default)
 * @accessibility 
 * - Associates error text with the input visually and semantically (using standard Paper implementation).
 */
export function ThemedTextInput({ errorText, ...props }: ThemedTextInputProps) {
  return (
    <View style={styles.container}>
      <PaperTextInput
        mode="outlined"
        error={!!errorText}
        style={[styles.input, props.style]}
        {...props}
      />
      {errorText ? (
        <Text style={styles.errorText}>{errorText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
  },
  input: {
    backgroundColor: 'transparent',
  },
  errorText: {
    color: '#BA1A1A',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
