import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Spacing } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence: one render throw anywhere in the app used to give a
 * white screen with no way out, on a device with no developer to look at it.
 *
 * The fallback is recoverable — clearing the error re-renders the tree, which
 * is enough for a transient failure (a chart handed a bad number) and honest
 * about the rest. It does NOT claim the underlying problem is fixed.
 *
 * A class component because that is the only way to catch a render error in
 * React; there is no hook for this.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Unhandled render error:', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.container}>
        <ThemedText type="subtitle" style={styles.title}>
          Something broke on this screen
        </ThemedText>
        <ThemedText themeColor="onSurfaceVariant" style={styles.body}>
          Nothing you entered was lost by this — anything already saved is still saved. Try again,
          and if this keeps happening tell the owner what you were doing.
        </ThemedText>
        <View style={styles.action}>
          <PrimaryButton onPress={() => this.setState({ error: null })}>Try again</PrimaryButton>
        </View>
        {__DEV__ ? (
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.detail}>
            {error.message}
          </ThemedText>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  title: { fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  action: { alignItems: 'flex-start' },
  detail: { fontFamily: 'monospace', fontSize: 11 },
});
