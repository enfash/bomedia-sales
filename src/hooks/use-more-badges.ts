import { useRecords } from '@/hooks/use-records';
import { useMemo } from 'react';

/**
 * Actionable counts surfaced as badges on the "More" menu, so staff see what
 * needs attention without opening each page. Keep this list short and truly
 * actionable — a badge that's always lit teaches people to ignore it.
 *
 * Keyed by route href so both the tab-bar dot and the menu items can read it.
 */
export interface MoreBadges {
  counts: Record<string, number>;
  hasAny: boolean;
}

export function useMoreBadges(): MoreBadges {
  const { sortedBatches } = useRecords();

  return useMemo(() => {
    // Jobs finished on the machine and awaiting pickup/dispatch.
    const readyToDispatch = sortedBatches.filter((b) => b.productionStage === 'Ready').length;
    // Distinct clients with an outstanding balance to chase.
    const clientsOwing = new Set(
      sortedBatches.filter((b) => b.totalBalance > 0).map((b) => b.clientName),
    ).size;

    const counts: Record<string, number> = {};
    if (readyToDispatch > 0) counts['/board'] = readyToDispatch;
    if (clientsOwing > 0) counts['/clients'] = clientsOwing;

    return { counts, hasAny: Object.keys(counts).length > 0 };
  }, [sortedBatches]);
}
