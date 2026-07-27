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
}

/**
 * Signed-in identity (avatar + name + email) plus a Log out action, with the
 * shared confirm dialog ("Log out of BOMedia?"). Rendered by BOTH the mobile
 * More menu and the web sidebar, so the identity + logout logic lives once.
 */
export function AccountSection({ style }: AccountSectionProps) {
  const theme = useTheme();
  const { user, signOut } = useAuth();

  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const name = user?.displayName?.trim() || 'Signed in';
  const email = user?.email || '';

  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut(); // AuthProvider flips the gate → sign-in screen; this unmounts.
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

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
        onPress={() => setConfirming(true)}
        style={styles.logout}
      >
        Log out
      </SecondaryButton>

      <ConfirmDialog
        visible={confirming}
        title="Log out"
        message="Log out of BOMedia?"
        confirmLabel="Log out"
        cancelLabel="Cancel"
        isDestructive
        isLoading={loading}
        onConfirm={handleLogout}
        onCancel={() => setConfirming(false)}
      />
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
