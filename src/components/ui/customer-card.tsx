import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Surface, Text, Avatar } from 'react-native-paper';

export interface CustomerCardProps {
  name: string;
  email?: string;
  initials?: string;
  avatarUrl?: string;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

/**
 * @description Standardized card for displaying customer overview.
 * @props CustomerCardProps (name, email, initials, avatarUrl, style, onPress)
 * @example
 * <CustomerCard 
 *   name="Jane Doe" 
 *   email="jane@example.com" 
 *   initials="JD" 
 * />
 * @variants Elevated Surface (1dp)
 * @accessibility 
 * - Avatar acts as a visual complement to the textual name.
 * - Entire card can be made actionable via onPress.
 */
export function CustomerCard({
  name,
  email,
  initials,
  avatarUrl,
  style,
  onPress,
}: CustomerCardProps) {
  return (
    <Surface
      style={[styles.card, style]}
      elevation={1}
      onTouchEnd={onPress}
    >
      <View style={styles.content}>
        {avatarUrl ? (
          <Avatar.Image size={40} source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <Avatar.Text size={40} label={initials || name.substring(0, 2).toUpperCase()} style={styles.avatar} />
        )}
        <View style={styles.info}>
          <Text variant="titleMedium" style={styles.name}>{name}</Text>
          {email && <Text variant="bodyMedium" style={styles.email}>{email}</Text>}
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    marginRight: 16,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontWeight: '600',
  },
  email: {
    color: '#6B7280',
    marginTop: 2,
  },
});
