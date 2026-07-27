import { useAuth } from '@/context/auth-context';
import { ActivityEntry, subscribeToActivity } from '@/services/activity';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const LAST_SEEN_PREFIX = 'bomedia:activity:lastSeen:';

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
  const [lastSeenMs, setLastSeenMs] = useState<number>(0);

  const seenKey = user ? `${LAST_SEEN_PREFIX}${user.uid}` : null;

  // Restore the watermark for this user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!seenKey) {
        if (!cancelled) setLastSeenMs(0);
        return;
      }
      try {
        const v = await AsyncStorage.getItem(seenKey);
        const n = v ? Number(v) : 0;
        if (!cancelled) setLastSeenMs(Number.isFinite(n) ? n : 0);
      } catch {
        if (!cancelled) setLastSeenMs(0);
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
    const now = Date.now();
    setLastSeenMs(now);
    if (seenKey) {
      try {
        await AsyncStorage.setItem(seenKey, String(now));
      } catch {
        // non-fatal — badge just won't persist across reloads
      }
    }
  }, [seenKey]);

  return { entries, loading, unreadCount, markAllSeen };
}
