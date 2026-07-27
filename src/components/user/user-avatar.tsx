import { ThemedText } from '@/components/themed-text';
import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Curated, muted, finance-appropriate hues (no rainbow — per brand rules).
 * Every hue is verified to keep WHITE initials readable (all ≥ 4.5:1 contrast
 * with #fff, WCAG AA for text). Do not add a hue without re-checking contrast.
 */
const AVATAR_HUES = [
  '#2E388D', // indigo (brand)
  '#1F6F54', // teal green
  '#8A2D3B', // wine
  '#5A3E8E', // purple
  '#1E5A8A', // steel blue
  '#7A4E1E', // brown
  '#3E5C3A', // forest
  '#4B4E6D', // slate
];

function initialsFrom(name?: string | null, email?: string | null): string {
  const base = (name && name.trim()) || (email ? email.split('@')[0] : '') || '?';
  const parts = base.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

/** Deterministic hue from a stable key so a user always gets the same colour. */
function hueFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  size?: number;
  /** Reserved for a future photo upload — falls back to initials when absent. */
  photoUrl?: string | null;
}

/**
 * Circular initials avatar on a name-derived colour. Shared across the app bar,
 * the mobile More menu and the web sidebar so there's a single source of truth.
 */
export function UserAvatar({ name, email, size = 40 }: UserAvatarProps) {
  const initials = initialsFrom(name, email);
  const backgroundColor = hueFor((name || email || '?').toLowerCase());

  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor }]}
      accessibilityLabel={name || email || 'Account'}
    >
      <ThemedText style={{ color: '#ffffff', fontWeight: '700', fontSize: Math.round(size * 0.4) }}>
        {initials}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
