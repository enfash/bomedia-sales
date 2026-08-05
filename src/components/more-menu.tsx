import { ThemedText } from '@/components/themed-text';
import { AccountSection, LogoutConfirm } from '@/components/user/account-section';
import { useAuth } from '@/context/auth-context';
import { useActivity } from '@/hooks/use-activity';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { STATUS_META } from '@/utils/payment-status';
import { Feather } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PANEL_WIDTH = Math.min(300, Dimensions.get('window').width * 0.82);

/** Emit this (via DeviceEventEmitter) to open the More menu from anywhere. */
export const OPEN_MORE_EVENT = 'bomedia:open-more';

/**
 * Secondary destinations, shown behind the "More" button on mobile. `badgeTone`
 * picks the colour of the actionable count (green = ready to act, red = needs
 * chasing); items without a count show no badge.
 */
const MORE_ITEMS = [
  { href: '/board', label: 'Production Board', icon: 'layout', desc: 'Jobs on the 10ft machine', badgeColor: STATUS_META.Paid.color },
  { href: '/clients', label: 'Clients', icon: 'users', desc: 'History and balances', badgeColor: STATUS_META.Unpaid.color },
  { href: '/expenses', label: 'Expenses', icon: 'dollar-sign', desc: 'Log operational costs', badgeColor: undefined },
  { href: '/settings', label: 'Settings', icon: 'settings', desc: 'Materials, pricing, business', badgeColor: undefined },
] as const;

interface MoreMenuProps {
  visible: boolean;
  onClose: () => void;
  counts?: Record<string, number>;
}

export function MoreMenu({ visible, onClose, counts = {} }: MoreMenuProps) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const { unreadCount } = useActivity();
  const [translateX] = useState(() => new Animated.Value(-PANEL_WIDTH));

  // Settings (materials/pricing) and the Activity feed are admin-only.
  const items = [
    ...MORE_ITEMS.filter((i) => i.href !== '/settings' || isAdmin),
    ...(isAdmin
      ? [
          { href: '/cash', label: 'Daily Cash', icon: 'dollar-sign', desc: 'Count the drawer against the ledger', badgeColor: STATUS_META.Paid.color } as const,
          { href: '/activity', label: 'Activity', icon: 'bell', desc: "Your team's recent actions", badgeColor: theme.error } as const,
        ]
      : []),
  ];

  // The Activity row's badge shows the live unread count.
  const mergedCounts: Record<string, number> = { ...counts, '/activity': unreadCount };

  /**
   * A logout asked for from inside the drawer, waiting for the drawer to go.
   *
   * A ref rather than state: it is read in an animation callback, and flipping
   * it must not re-render the panel mid-slide.
   */
  const logoutPending = useRef(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: visible ? 0 : -PANEL_WIDTH,
      duration: visible ? 240 : 160,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Only once the panel has actually left. Showing the dialog on the same
      // tick as the close would put it behind a Modal still fading out — the
      // very thing this fixes, just briefly. setState in the animation-done
      // callback, never synchronously in the effect body.
      if (finished && !visible && logoutPending.current) {
        logoutPending.current = false;
        setConfirmingLogout(true);
      }
    });
  }, [visible, translateX]);

  const go = (href: string) => {
    onClose();
    router.push(href as Parameters<typeof router.push>[0]);
  };

  return (
    <>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />

        <Animated.View
          style={[
            styles.panel,
            {
              width: PANEL_WIDTH,
              paddingTop: insets.top + Spacing.four,
              paddingBottom: insets.bottom + Spacing.four,
              backgroundColor: theme.surface,
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={styles.header}>
            <ThemedText type="subtitle" style={{ fontWeight: '700' }}>More</ThemedText>
            <ThemedText type="small" themeColor="onSurfaceVariant">
              Everything outside your daily flow
            </ThemedText>
          </View>

          <View style={styles.items}>
            {items.map((item) => {
              const active = pathname === item.href;
              const count = mergedCounts[item.href] || 0;
              const badgeColor = item.badgeColor || theme.primary;
              return (
                <Pressable
                  key={item.href}
                  onPress={() => go(item.href)}
                  style={({ pressed }) => [
                    styles.item,
                    active && { backgroundColor: theme.primary + '14' },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: active ? theme.primary : theme.surfaceVariant },
                    ]}
                  >
                    <Feather
                      name={item.icon}
                      size={18}
                      color={active ? theme.onPrimary : theme.onSurfaceVariant}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      type="smallBold"
                      style={{ color: active ? theme.primary : theme.onSurface }}
                    >
                      {item.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="onSurfaceVariant">
                      {item.desc}
                    </ThemedText>
                  </View>
                  {count > 0 && (
                    <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                      <ThemedText type="small" style={styles.badgeText}>{count}</ThemedText>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={{ flex: 1 }} />

          <View style={styles.account}>
            <AccountSection
              onLogoutPress={() => {
                logoutPending.current = true;
                onClose();
              }}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>

      {/* OUTSIDE the Modal, deliberately. Paper's Portal renders at the provider
          root, which is below a native Modal window — and anything inside the
          drawer is unmounted the moment it closes. */}
      <LogoutConfirm visible={confirmingLogout} onDismiss={() => setConfirmingLogout(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: Spacing.three,
  },
  header: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: 2,
  },
  items: {
    gap: Spacing.one,
  },
  account: {
    paddingHorizontal: Spacing.three,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
