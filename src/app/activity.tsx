import { ActivityList } from '@/components/activity/activity-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageContainer } from '@/components/ui/page-container';
import { Spacing } from '@/constants/theme';
import { useActivity } from '@/hooks/use-activity';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

/**
 * Admin activity feed — a chronological log of who did what (sales, payments,
 * production moves, expenses, deletes, edits). Opening the screen clears the
 * unread badge. On web the same feed is also reachable as a right-side drawer
 * (see activity-drawer); this full screen is the mobile surface.
 */
export default function ActivityScreen() {
  const { entries, loading, markAllSeen } = useActivity();

  // Opening the feed clears the unread watermark.
  useEffect(() => {
    markAllSeen();
  }, [markAllSeen]);

  return (
    <PageContainer>
      <Stack.Screen options={{ title: 'Activity' }} />
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={{ fontWeight: '700' }}>Activity</ThemedText>
          <ThemedText themeColor="onSurfaceVariant" style={{ fontSize: 14 }}>
            Everything your team logs, newest first.
          </ThemedText>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.six }}>
          <ActivityList entries={entries} loading={loading} />
        </ScrollView>
      </ThemedView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: Spacing.four, paddingHorizontal: Spacing.four },
  header: { gap: 2 },
});
