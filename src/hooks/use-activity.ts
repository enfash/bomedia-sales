import { useAuth } from '@/context/auth-context';
import { ActivityEntry, subscribeToActivity } from '@/services/activity';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const LAST_SEEN_PREFIX = 'bomedia:activity:lastSeen:';

/**
 * Shared "last seen" watermark store. The badge is rendered by several
 * independent `useActivity` consumers (sidebar bell, mobile tab dot, More menu,
 * the drawer/screen). A module-level store with listeners keeps them all in
 * sync live — so opening the feed in one place clears the badge everywhere
 * without a reload.
 */
const watermarks = new Map<string, number>();
const listeners = new Set<() => void>();

function notifyWatermark() {
  listeners.forEach((l) => l());
}

function setWatermark(key: string, ms: number) {
  watermarks.set(key, ms);
  notifyWatermark();
}

/**
 * Activity feed for the admin: live entries plus an unread count relative to a
 * per-user "last seen" watermark (persisted so the badge survives reloads).
 * Only admins can read the feed (security rules), so the subscription is a
 * no-op for staff.
 */
export function useActivity() {
  const { user, isAdmin } = useAuth();
  const [rawEntries, setRawEntries] = useState<ActivityEntry[]>([]);
  const [subLoading, setSubLoading] = useState(true);

  const seenKey = user ? `${LAST_SEEN_PREFIX}${user.uid}` : null;
  const [lastSeenMs, setLastSeenMs] = useState<number>(() => (seenKey ? watermarks.get(seenKey) ?? 0 : 0));

  // Keep this instance's watermark in sync with the shared store.
  useEffect(() => {
    const sync = () => setLastSeenMs(seenKey ? watermarks.get(seenKey) ?? 0 : 0);
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [seenKey]);

  // Restore the persisted watermark once per user (into the shared store).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!seenKey || watermarks.has(seenKey)) return;
      try {
        const v = await AsyncStorage.getItem(seenKey);
        const n = v ? Number(v) : 0;
        if (!cancelled) setWatermark(seenKey, Number.isFinite(n) ? n : 0);
      } catch {
        if (!cancelled) setWatermark(seenKey, 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seenKey]);

  // Subscribe to the feed (admins only). setState happens only inside the
  // subscription callback — never synchronously in the effect body.
  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribe = subscribeToActivity((next) => {
      setRawEntries(next);
      setSubLoading(false);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  // Staff can't read the feed, so their view is always empty and settled.
  const entries = isAdmin ? rawEntries : [];
  const loading = isAdmin ? subLoading : false;
  const unreadCount = entries.reduce((n, e) => n + ((e.atMs || 0) > lastSeenMs ? 1 : 0), 0);

  const markAllSeen = useCallback(async () => {
    if (!seenKey) return;
    const now = Date.now();
    setWatermark(seenKey, now); // updates every consumer live via the store
    try {
      await AsyncStorage.setItem(seenKey, String(now));
    } catch {
      // non-fatal — badge just won't persist across reloads
    }
  }, [seenKey]);

  return { entries, loading, unreadCount, markAllSeen };
}
