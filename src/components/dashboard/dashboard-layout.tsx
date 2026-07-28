import { ThemedText } from '@/components/themed-text';
import { UserAvatar } from '@/components/user/user-avatar';
import { Spacing, WebContentMaxWidth, WebContentPaddingH, WebContentPaddingV } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

interface DashboardLayoutProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The desktop dashboard shell: a scrolling, max-width content column with a
 * title block and an optional right-aligned action slot. Web-first — the mobile
 * build uses its own simple screens.
 */
export function DashboardLayout({ eyebrow, title, subtitle, right, children }: DashboardLayoutProps) {
  const theme = useTheme();
  const { user } = useAuth();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 240 }}>
            {eyebrow ? (
              <ThemedText type="smallBold" themeColor="onSurfaceVariant" style={styles.eyebrow}>
                {eyebrow}
              </ThemedText>
            ) : null}
            <ThemedText style={styles.title}>{title}</ThemedText>
            {subtitle ? (
              <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          <View style={styles.headerRight}>
            {right ? <View>{right}</View> : null}
            <UserAvatar name={user?.displayName} email={user?.email} size={40} />
          </View>
        </View>

        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: WebContentPaddingV,
  },
  inner: {
    width: '100%',
    maxWidth: WebContentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: WebContentPaddingH,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 11,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
});
