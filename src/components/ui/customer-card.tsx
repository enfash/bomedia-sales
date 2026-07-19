import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { Surface, Text, Avatar } from 'react-native-paper';

export interface CustomerCardProps {
  name: string;
  email?: string;
  initials?: string;
  avatarUrl?: string;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  children?: React.ReactNode;
}

/**
 * @description Standardized card for displaying customer overview.
 * @props CustomerCardProps (name, email, initials, avatarUrl, style, onPress, children)
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
  children
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
      {children && (
        <View style={styles.childrenContainer}>
          {children}
        </View>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Platform.OS === 'web' ? 16 : 0,
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
  childrenContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  }
});
