import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import {
  dismiss as dismissEntry,
  list as listJournal,
  subscribe as subscribeJournal,
  type JournalEntry,
  type ReconcileResult,
} from '@/services/pending-journal';
import { bySeverity, classify, type PendingItem } from '@/services/pending-state';
import { reconcilePendingWrites } from '@/services/reconcile-pending';

interface PendingWritesValue {
  /** Worst-first: anything needing action is at the top. */
  items: PendingItem[];
  /** True while the cold-start check is still running. Never shown as reassurance. */
  reconciling: boolean;
  dismiss: (key: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const PendingWritesContext = createContext<PendingWritesValue | undefined>(undefined);

/**
 * Owns what the operator is told about writes that may not have landed.
 *
 * COLD-START RECONCILIATION RUNS HERE, and this provider is mounted above the
 * navigator — so it runs before any screen subscribes to anything. The
 * existence check is a REST read and cannot be answered by the SDK cache, so
 * ordering is not what makes it correct; it is that the operator should learn a
 * payment may be missing BEFORE they start taking the next one.
 *
 * It never blocks rendering. Offline, the check simply cannot answer, and
 * holding the app closed until the network agrees would be a worse failure than
 * the one being reported.
 */
export function PendingWritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [reconciled, setReconciled] = useState<ReconcileResult | undefined>(undefined);
  const [reconciling, setReconciling] = useState(false);

  /**
   * Keys already in the journal when this process started — writes from a
   * previous life. Nothing is still trying for them, so they can never be
   * shown as "pending".
   */
  const [carriedOver, setCarriedOver] = useState<Set<string>>(() => new Set());
  const startedFor = useRef<string | null>(null);

  const reload = useCallback(async () => {
    setEntries(await listJournal());
  }, []);

  // Track the journal live, so a write registered now shows as pending at once.
  // setState happens only inside the async callback — never synchronously in
  // the effect body, which would cascade a render on every mount.
  useEffect(() => {
    let active = true;
    const pull = () => {
      void listJournal().then((next) => {
        if (active) setEntries(next);
      });
    };
    const unsubscribe = subscribeJournal(pull);
    pull();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // The cold-start check: once per signed-in session, as early as there is a
  // user to authenticate the read with.
  useEffect(() => {
    if (!user || startedFor.current === user.uid) return;
    startedFor.current = user.uid;

    let cancelled = false;
    (async () => {
      const existing = await listJournal();
      if (!cancelled) setCarriedOver(new Set(existing.map((e) => e.key)));
      if (existing.length === 0) return;

      setReconciling(true);
      try {
        const result = await reconcilePendingWrites();
        if (!cancelled) setReconciled(result);
      } finally {
        if (!cancelled) {
          setReconciling(false);
          await reload();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, reload]);

  const value = useMemo<PendingWritesValue>(() => {
    const items = classify(entries, carriedOver, reconciled).sort(bySeverity);
    return {
      items,
      reconciling,
      dismiss: async (key: string) => {
        await dismissEntry(key);
        await reload();
      },
      refresh: reload,
    };
  }, [entries, carriedOver, reconciled, reconciling, reload]);

  return <PendingWritesContext.Provider value={value}>{children}</PendingWritesContext.Provider>;
}

export function usePendingWrites(): PendingWritesValue {
  const ctx = useContext(PendingWritesContext);
  // Deliberately non-throwing: a screen rendered outside the provider shows no
  // warnings rather than crashing. The warning is important; it is not worth a
  // white screen.
  return ctx ?? { items: [], reconciling: false, dismiss: async () => {}, refresh: async () => {} };
}

/** Is there an unresolved write for this sale? Used by the row chips. */
export function usePendingFor(receiptId?: string): PendingItem | undefined {
  const { items } = usePendingWrites();
  if (!receiptId) return undefined;
  return items.find((i) => i.entry.receiptId === receiptId || i.entry.key === receiptId);
}
