import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared pull-to-refresh handler.
 *
 * Awaits every refresher (they may be sync or async) and keeps the spinner up
 * for at least `minMs`, whichever is longer — so a fast refetch still feels
 * like a deliberate action, and a slow one never hides the spinner before the
 * data has actually landed. That second half matters now that refreshers are
 * real fetches (Postgres-backed reads, one screen at a time as the db.ts port
 * lands) rather than the cosmetic nudge this was written for when every
 * source was a realtime Firebase listener already pushing its own updates.
 */
export function usePullRefresh(refreshers: (() => void | Promise<void>)[], minMs = 700) {
  const [refreshing, setRefreshing] = useState(false);
  // Keep the latest refreshers without making `onRefresh` change identity.
  const ref = useRef(refreshers);
  useEffect(() => {
    ref.current = refreshers;
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const floor = new Promise((resolve) => setTimeout(resolve, minMs));
    await Promise.all([Promise.all(ref.current.map((r) => r())), floor]);
    setRefreshing(false);
  }, [minMs]);

  return { refreshing, onRefresh };
}
