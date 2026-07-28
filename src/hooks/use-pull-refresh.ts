import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared pull-to-refresh handler. Calls each refresher (e.g. `useRecords().refresh`)
 * and keeps the spinner up for a short minimum so the gesture feels responsive
 * even though the underlying Firebase listeners are already realtime.
 */
export function usePullRefresh(refreshers: (() => void)[], minMs = 700) {
  const [refreshing, setRefreshing] = useState(false);
  // Keep the latest refreshers without making `onRefresh` change identity.
  const ref = useRef(refreshers);
  useEffect(() => {
    ref.current = refreshers;
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    ref.current.forEach((r) => r());
    await new Promise((resolve) => setTimeout(resolve, minMs));
    setRefreshing(false);
  }, [minMs]);

  return { refreshing, onRefresh };
}
