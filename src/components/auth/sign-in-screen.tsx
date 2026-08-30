import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/utils/color';
import { AuthError } from '@supabase/supabase-js';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Checkbox, Surface } from 'react-native-paper';

/** Turn a Supabase auth error into a calm, human message (never leak codes). */
function messageForError(e: unknown): string {
  if (e instanceof AuthError) {
    switch (e.code) {
      case 'provider_disabled':
        return 'Google sign-in is not enabled for this project yet.';
      case 'signup_disabled':
      case 'email_provider_disabled':
        return 'Sign-ups are closed. Ask an admin to add your email before trying again.';
      case 'over_request_rate_limit':
        return 'Too many attempts. Please try again in a moment.';
      default:
        return 'Could not sign in. Please try again.';
    }
  }
  return 'Could not sign in. Please try again.';
}

/**
 * Google sign-in. Rendered by the root gate when no user is present, so the
 * rest of the app never mounts until authentication succeeds.
 *
 * There is no self-registration: signInWithGoogle only ever succeeds for an
 * email an admin has already added to `allowed_users` — see
 * supabase/README.md. A rejected email surfaces here as the same calm
 * "could not sign in" message as any other failure, deliberately: the
 * sign-in screen doesn't tell an unrecognised visitor whether the problem
 * was their email, their password (there isn't one), or something else.
 */
export function SignInScreen() {
  const theme = useTheme();
  const { signInWithGoogle, sessionExpired, clearSessionExpired } = useAuth();

  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSignIn = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    if (sessionExpired) clearSessionExpired();
    try {
      await signInWithGoogle(keepSignedIn);
      // Web: the page navigates away to Google and back; nothing further to
      // do here. Native: success flips onAuthStateChanged, which flips the
      // root gate and unmounts this screen.
    } catch (e) {
      setError(messageForError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={[styles.root, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <Image
              source={require('@/assets/images/bomedia-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />

            <Surface elevation={1} style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.heading}>
                <ThemedText type="subtitle" style={styles.title}>Sign in</ThemedText>
                <ThemedText type="small" themeColor="onSurfaceVariant">
                  Welcome back. Sign in to access your dashboard.
                </ThemedText>
              </View>

              {sessionExpired ? (
                <View style={[styles.notice, { backgroundColor: withAlpha(theme.primary, 0.08) }]}>
                  <ThemedText type="small" themeColor="onSurfaceVariant">
                    You were signed out after 48 hours of inactivity. Please sign in again.
                  </ThemedText>
                </View>
              ) : null}

              <View style={styles.form}>
                {/* Keep-me-signed-in: checkbox + label toggle independently so a
                    tap on either fires exactly once; label stays on one line. */}
                <View style={styles.keepRow}>
                  <Checkbox
                    status={keepSignedIn ? 'checked' : 'unchecked'}
                    color={theme.primary}
                    onPress={() => setKeepSignedIn((v) => !v)}
                    disabled={submitting}
                  />
                  <Pressable onPress={() => setKeepSignedIn((v) => !v)} hitSlop={6}>
                    <ThemedText type="small" numberOfLines={1}>Keep me signed in</ThemedText>
                  </Pressable>
                </View>

                {error ? (
                  <ThemedText type="small" style={{ color: theme.error }}>{error}</ThemedText>
                ) : null}

                <PrimaryButton
                  onPress={onSignIn}
                  loading={submitting}
                  disabled={submitting}
                  icon="google"
                  style={styles.submit}
                >
                  Continue with Google
                </PrimaryButton>
              </View>
            </Surface>

            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.footer}>
              Accounts are managed by your administrator.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  column: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: Spacing.four,
  },
  logo: {
    width: 150,
    height: 42,
    alignSelf: 'center',
  },
  card: {
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  heading: {
    gap: Spacing.one,
  },
  title: {
    fontWeight: '700',
  },
  form: {
    gap: Spacing.three,
  },
  notice: {
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  keepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginLeft: -6,
  },
  submit: {
    marginTop: Spacing.one,
  },
  footer: {
    textAlign: 'center',
  },
});
