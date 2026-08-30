import { useAuth } from '@/context/auth-context';
import { ActivityEntry, fetchActivity } from '@/services/activity';
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
 * Activity feed for the admin: a fetched snapshot plus an unread count
 * relative to a per-user "last seen" watermark (persisted so the badge
 * survives reloads). Only admins can read the feed (RLS), so the fetch is
 * skipped entirely for staff.
 *
 * Fetched once on mount / when `isAdmin` resolves — not realtime (out of
 * scope for this port; see supabase/README.md). A caller that needs fresher
 * data calls `refresh()`, typically wired to pull-to-refresh via
 * `usePullRefresh`. Consumers that stay mounted without a refresh gesture of
 * their own (the web drawer) call `refresh()` when they open instead.
 */
export function useActivity() {
  const { user, isAdmin } = useAuth();
  const [rawEntries, setRawEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

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

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const entries = await fetchActivity();
      setRawEntries(entries);
    } catch (err) {
      console.warn('useActivity: fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  // Fetch once per admin resolution. Staff never fetch — their view is
  // always empty and settled, matching what the realtime subscription used
  // to do for them (a no-op, since RLS gave them nothing to read).
  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
  }, [isAdmin, load]);

  const entries = isAdmin ? rawEntries : [];
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

  return { entries, loading, unreadCount, markAllSeen, refresh: load };
}
