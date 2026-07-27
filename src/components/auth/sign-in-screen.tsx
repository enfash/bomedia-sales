import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ThemedTextInput } from '@/components/ui/themed-text-input';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/utils/color';
import { FirebaseError } from 'firebase/app';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Checkbox, Surface, TextInput } from 'react-native-paper';

/** Turn a Firebase auth error into a calm, human message (never leak codes). */
function messageForError(e: unknown): string {
  if (e instanceof FirebaseError) {
    switch (e.code) {
      case 'auth/invalid-email':
        return 'That email address looks invalid.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again in a moment.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      default:
        return 'Could not sign in. Please try again.';
    }
  }
  return 'Could not sign in. Please try again.';
}

/**
 * Email/password sign-in. Rendered by the root gate when no user is present, so
 * the rest of the app never mounts until authentication succeeds. Uses the
 * existing brand components (PrimaryButton, ThemedTextInput) and MD3 theme.
 */
export function SignInScreen() {
  const theme = useTheme();
  const { signIn, sessionExpired, clearSessionExpired } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clearNotices = () => {
    if (error) setError(null);
    if (sessionExpired) clearSessionExpired();
  };

  const onSubmit = async () => {
    if (submitting) return;
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password, keepSignedIn);
      // Success: onAuthStateChanged flips the gate and unmounts this screen.
    } catch (e) {
      setError(messageForError(e));
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
                <ThemedTextInput
                  label="Email"
                  value={email}
                  onChangeText={(t) => { setEmail(t); clearNotices(); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  editable={!submitting}
                />

                <ThemedTextInput
                  label="Password"
                  value={password}
                  onChangeText={(t) => { setPassword(t); clearNotices(); }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  editable={!submitting}
                  onSubmitEditing={onSubmit}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowPassword((s) => !s)}
                      forceTextInputFocus={false}
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    />
                  }
                />

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
                  onPress={onSubmit}
                  loading={submitting}
                  disabled={submitting}
                  style={styles.submit}
                >
                  Sign in
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
