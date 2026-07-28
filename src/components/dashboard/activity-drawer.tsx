import { ActivityList } from '@/components/activity/activity-list';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useActivity } from '@/hooks/use-activity';
import { useTheme } from '@/hooks/use-theme';
import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

/** Window event any UI can dispatch to open the drawer (e.g. the sidebar bell). */
export const OPEN_ACTIVITY_DRAWER_EVENT = 'bomedia:activity-drawer';

const PANEL_WIDTH = 400;

/**
 * Web-only activity feed as a right-side drawer. Instead of navigating to a
 * full page, the sidebar bell slides this panel in over the current screen
 * (backdrop dims the rest, click-away or ✕ closes it). Always mounted so it can
 * animate in and out; the data subscription only matters while it's open.
 */
export function ActivityDrawer() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // keeps the panel in the tree during the close animation
  const { entries, loading, markAllSeen } = useActivity();

  // useState (not useRef) so the Animated.Values are created once without
  // reading a ref during render (lint: react-hooks/refs).
  const [translateX] = useState(() => new Animated.Value(PANEL_WIDTH));
  const [backdrop] = useState(() => new Animated.Value(0));

  // Opening mounts the panel and clears the unread badge (done in the handler,
  // never as a synchronous setState inside an effect body).
  const doOpen = useCallback(() => {
    setMounted(true);
    setOpen(true);
    markAllSeen();
  }, [markAllSeen]);

  // Listen for the open event (dispatched by the sidebar bell).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.addEventListener(OPEN_ACTIVITY_DRAWER_EVENT, doOpen);
    return () => window.removeEventListener(OPEN_ACTIVITY_DRAWER_EVENT, doOpen);
  }, [doOpen]);

  // Close on Escape while open.
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Drive the slide + fade. setState happens only in the animation-done
  // callback (unmount after the close finishes), never in the effect body.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: open ? 0 : PANEL_WIDTH,
        duration: open ? 260 : 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(backdrop, {
        toValue: open ? 1 : 0,
        duration: open ? 260 : 200,
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, translateX, backdrop]);

  if (!mounted) return null;

  return (
    <View style={styles.overlay} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)', opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close activity" />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          { backgroundColor: theme.surface, borderLeftColor: theme.outlineVariant, transform: [{ translateX }] },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: theme.outlineVariant }]}>
          <View style={{ flex: 1 }}>
            <ThemedText type="subtitle" style={{ fontWeight: '700' }}>Activity</ThemedText>
            <ThemedText type="small" themeColor="onSurfaceVariant">Everything your team logs, newest first.</ThemedText>
          </View>
          <Pressable
            onPress={() => setOpen(false)}
            style={({ pressed }) => [styles.closeBtn, { borderColor: theme.outlineVariant }, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Close"
          >
            <Feather name="x" size={18} color={theme.onSurfaceVariant} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <ActivityList entries={entries} loading={loading} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    maxWidth: '100%',
    borderLeftWidth: 1,
    boxShadow: '-12px 0px 40px rgba(0,0,0,0.18)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
});
