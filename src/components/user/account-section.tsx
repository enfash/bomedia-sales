import { ThemedText } from '@/components/themed-text';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { UserAvatar } from '@/components/user/user-avatar';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { StyleSheet, View } from 'react-native';
import { useState } from 'react';

interface AccountSectionProps {
  /** Extra style for the outer container (e.g. borders/padding per surface). */
  style?: object;
  /**
   * Take over the logout flow instead of confirming here.
   *
   * Passed by a host that lives inside a native `Modal` — the confirm dialog
   * cannot render above that window, and would be unmounted with it anyway when
   * the drawer closes. Such a host closes itself and renders `LogoutConfirm`.
   */
  onLogoutPress?: () => void;
}

/**
 * Signed-in identity (avatar + name + email) plus a Log out action, with the
 * shared confirm dialog ("Log out of BOMedia?"). Rendered by BOTH the mobile
 * More menu and the web sidebar, so the identity + logout logic lives once.
 */
/**
 * The confirm + sign-out itself, separated from where the button lives.
 *
 * The mobile More menu is a React Native `Modal` — a separate native window
 * above the whole app tree — and Paper's `Portal` renders at the provider root,
 * UNDERNEATH it. So a dialog opened from inside the drawer renders behind the
 * drawer, and no z-index can lift it: it is in the wrong window, not the wrong
 * layer. The drawer therefore closes first and renders this OUTSIDE its Modal,
 * which is why the dialog cannot live inside `AccountSection` for that host.
 */
export function LogoutConfirm({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut(); // AuthProvider flips the gate → sign-in screen; this unmounts.
    } finally {
      setLoading(false);
      onDismiss();
    }
  };

  return (
    <ConfirmDialog
      visible={visible}
      title="Log out"
      message="Log out of BOMedia?"
      confirmLabel="Log out"
      cancelLabel="Cancel"
      isDestructive
      isLoading={loading}
      onConfirm={handleLogout}
      onCancel={onDismiss}
    />
  );
}

export function AccountSection({ style, onLogoutPress }: AccountSectionProps) {
  const theme = useTheme();
  const { user } = useAuth();

  const [confirming, setConfirming] = useState(false);

  const name = user?.displayName?.trim() || 'Signed in';
  const email = user?.email || '';

  return (
    <View style={[styles.container, { borderTopColor: theme.outlineVariant }, style]}>
      <View style={styles.identity}>
        <UserAvatar name={user?.displayName} email={email} size={40} />
        <View style={styles.text}>
          <ThemedText type="smallBold" numberOfLines={1}>{name}</ThemedText>
          {email ? (
            <ThemedText type="small" themeColor="onSurfaceVariant" numberOfLines={1}>{email}</ThemedText>
          ) : null}
        </View>
      </View>

      <SecondaryButton
        icon="logout"
        onPress={() => (onLogoutPress ? onLogoutPress() : setConfirming(true))}
        style={styles.logout}
      >
        Log out
      </SecondaryButton>

      {/* Only when this host owns the flow. A host inside a native Modal passes
          `onLogoutPress` and renders LogoutConfirm outside that Modal itself. */}
      {onLogoutPress ? null : (
        <LogoutConfirm visible={confirming} onDismiss={() => setConfirming(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
  },
  logout: {
    alignSelf: 'stretch',
  },
});
