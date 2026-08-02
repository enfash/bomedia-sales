import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { OPEN_ACTIVITY_DRAWER_EVENT } from '@/components/dashboard/activity-drawer';
import { openCommandPalette } from '@/components/dashboard/command-palette';
import { UserAvatar } from '@/components/user/user-avatar';
import { Spacing, WebHeader } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useActivity } from '@/hooks/use-activity';
import { useTheme } from '@/hooks/use-theme';

/**
 * The web app bar: a flat 48px navy strip across the top of every desktop
 * screen, above both the sidebar and the content column.
 *
 * It carries the brand mark (moved here out of the sidebar), the quick search,
 * and the icon cluster — apps grid, activity bell, settings, account. Separation
 * from the content below comes from a 1px border a shade darker than the bar
 * itself; deliberately no shadow, no elevation.
 *
 * Web only — the mobile build has its own chrome and never renders this.
 */
export function WebTopBar() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  return (
    <View style={styles.bar}>
      <View style={[styles.brand, isCompact && styles.brandCompact]}>
        {isCompact ? (
          <Image
            source={require('@/assets/images/bomedia-icon.png')}
            style={styles.logoMark}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={require('@/assets/images/bomedia-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        )}
      </View>

      <QuickSearch isCompact={isCompact} />

      <View style={styles.spacer} />

      <View style={styles.actions}>
        <IconButton
          icon="grid"
          label="Jump to…"
          onPress={() => openCommandPalette()}
        />
        {isAdmin ? (
          <>
            <ActivityBellButton />
            <IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />
          </>
        ) : null}
        <View style={styles.avatar}>
          <UserAvatar name={user?.displayName} email={user?.email} size={28} />
        </View>
      </View>
    </View>
  );
}

/**
 * Quick search. This is a real input rather than a button so it reads and
 * behaves like a search field, but the results live in the command palette —
 * focusing opens the palette, and any keystrokes that land here first are
 * handed over as its starting query rather than dropped.
 */
function QuickSearch({ isCompact }: { isCompact: boolean }) {
  const [hovered, setHovered] = useState(false);
  // Only ever holds the handful of characters typed before the palette takes
  // focus; it is cleared on blur so the field never shows a stale query.
  const [text, setText] = useState('');

  if (isCompact) {
    return <IconButton icon="search" label="Search" onPress={() => openCommandPalette()} />;
  }

  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => openCommandPalette()}
      style={[styles.search, hovered && { backgroundColor: WebHeader.controlHover }]}
    >
      <Feather name="search" size={14} color={WebHeader.foregroundMuted} />
      <TextInput
        value={text}
        onFocus={() => openCommandPalette()}
        onBlur={() => setText('')}
        onChangeText={(next) => {
          setText(next);
          openCommandPalette(next);
        }}
        placeholder="Search sales, clients, pages…"
        placeholderTextColor={WebHeader.foregroundMuted}
        style={styles.searchInput}
      />
      <ThemedText style={styles.kbd}>⌘K</ThemedText>
    </Pressable>
  );
}

/** The activity feed's bell, carrying its unread badge. Admin-only, as before. */
function ActivityBellButton() {
  const { unreadCount } = useActivity();

  return (
    <IconButton
      icon="bell"
      label={unreadCount > 0 ? `Activity (${unreadCount} unread)` : 'Activity'}
      badge={unreadCount}
      onPress={() => {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_ACTIVITY_DRAWER_EVENT));
      }}
    />
  );
}

function IconButton({
  icon,
  label,
  badge = 0,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  badge?: number;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconButton,
        hovered && { backgroundColor: WebHeader.controlHover },
        pressed && styles.pressed,
      ]}
    >
      <Feather name={icon} size={16} color={WebHeader.foreground} />
      {badge > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.error }]}>
          <ThemedText style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: WebHeader.height,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    backgroundColor: WebHeader.background,
    borderBottomWidth: 1,
    borderBottomColor: WebHeader.border,
  },
  brand: {
    width: 220 - Spacing.three * 2,
    justifyContent: 'center',
  },
  brandCompact: {
    width: 76 - Spacing.three * 2,
    alignItems: 'center',
  },
  logo: {
    width: 120,
    height: 28,
  },
  logoMark: {
    width: 24,
    height: 24,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
    maxWidth: 420,
    height: 30,
    paddingHorizontal: Spacing.two,
    borderRadius: WebHeader.radius,
    backgroundColor: WebHeader.control,
    transitionProperty: 'all',
    transitionDuration: WebHeader.transition,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 13,
    color: WebHeader.foreground,
    outlineWidth: 0,
  },
  kbd: {
    fontSize: 11,
    fontWeight: '600',
    color: WebHeader.foregroundMuted,
  },
  spacer: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  iconButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: WebHeader.radius,
    transitionProperty: 'all',
    transitionDuration: WebHeader.transition,
  },
  pressed: {
    opacity: 0.7,
  },
  avatar: {
    marginLeft: Spacing.two,
  },
  badge: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 14,
    color: WebHeader.foreground,
  },
});
