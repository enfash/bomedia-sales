import { ThemedText } from '@/components/themed-text';
import { SalesBatch } from '@/components/records/types';
import { Spacing } from '@/constants/theme';
import { useRecords } from '@/hooks/use-records';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { Feather } from '@expo/vector-icons';
import { WEB_NAV } from '@/constants/web-nav';
import { useAdminGate } from '@/hooks/use-admin-gate';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

/** Window event any UI can dispatch to open the palette (e.g. the top bar). */
export const OPEN_COMMAND_PALETTE_EVENT = 'bomedia:command-palette';

/**
 * Open the palette, optionally seeded with a query.
 *
 * The seed exists for the top bar's quick search: it is a real input, so a fast
 * typist can land a keystroke or two in it before the palette mounts and takes
 * focus. Those characters are forwarded here instead of being swallowed.
 */
export function openCommandPalette(query?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT, { detail: { query } }));
}

/** Extra search terms per destination — the labels alone are not enough. */
const NAV_KEYWORDS: Record<string, string> = {
  '/': 'home overview dashboard',
  '/records': 'sales transactions history',
  '/clients': 'customers debtors',
  '/board': 'kanban jobs production',
  '/quote': 'estimate quotation',
  '/new-sales': 'add create sale',
  '/expenses': 'spend costs',
  '/analytics': 'insights charts reports',
  '/settings': 'preferences materials pricing',
  '/cash': 'drawer reconciliation takings',
};

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  keywords?: string;
  run: () => void;
}

/**
 * Global ⌘K / Ctrl+K command palette (web power-user polish, Phase 4). Always
 * mounted so its shortcut listener persists; the data-bound modal only mounts
 * while open, so Firebase isn't subscribed until first use.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  // The query lives here rather than in the modal so an open event can seed it
  // from a handler — the modal stays mounted and no effect has to sync it.
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setQuery('');
        setOpen((v) => !v);
      }
    };
    const onOpen = (e: Event) => {
      setQuery((e as CustomEvent<{ query?: string }>).detail?.query ?? '');
      setOpen(true);
    };

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  if (!open) return null;
  return <PaletteModal query={query} onQueryChange={setQuery} onClose={() => setOpen(false)} />;
}

function PaletteModal({
  query,
  onQueryChange,
  onClose,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const gate = useAdminGate();
  const { sortedBatches: batches } = useRecords(theme);

  const [index, setIndex] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  /** Row y-offsets by flat index, so the keyboard cursor can be scrolled to. */
  const rowOffsets = useRef<number[]>([]);

  const go = (path: string) => {
    onClose();
    router.push(path as any);
  };

  /**
   * Derived from WEB_NAV and filtered by role — never hand-written.
   *
   * It was a second, hardcoded copy of the destination list, so it offered
   * Analytics and Settings to staff: the sidebar hid them and the palette
   * handed them straight back. Same class as the two sidebars disagreeing, and
   * the same fix — one list, read by everything that navigates.
   *
   * Admin destinations appear only on `allowed`. While the role is still
   * `pending` they are omitted, because offering a route and then removing it
   * mid-keystroke is worse than showing it a beat late.
   */
  const navItems: CommandItem[] = useMemo(
    () =>
      WEB_NAV.filter((item) => !item.adminOnly || gate === 'allowed').map((item) => ({
        id: `nav-${item.href}`,
        title: item.label,
        group: 'Navigation',
        icon: item.icon,
        keywords: NAV_KEYWORDS[item.href] ?? '',
        run: () => go(item.href),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gate],
  );

  const actionItems: CommandItem[] = useMemo(
    () => [
      { id: 'act-sale', title: 'Record a new sale', group: 'Actions', icon: 'plus-circle', keywords: 'add create', run: () => go('/new-sales') },
      { id: 'act-quote', title: 'Create a quote', group: 'Actions', icon: 'file-plus', keywords: 'add estimate', run: () => go('/quote') },
      { id: 'act-expense', title: 'Log an expense', group: 'Actions', icon: 'credit-card', keywords: 'add spend cost', run: () => go('/expenses') },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const transactionItems: CommandItem[] = useMemo(
    () =>
      batches.map((b: SalesBatch) => ({
        id: `txn-${b.id}`,
        title: b.clientName || 'Unknown client',
        subtitle: `${b.receiptId || b.id} · ${formatDate(b.createdAt)} · ${formatCurrency(b.totalAmount)}`,
        group: 'Transactions',
        icon: 'file' as const,
        keywords: `${b.receiptId || ''} ${b.status} ${b.records.map((r) => r.material).join(' ')}`,
        run: () => go(`/transaction/${b.id}`),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batches],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (it: CommandItem) =>
      !q ||
      it.title.toLowerCase().includes(q) ||
      (it.subtitle || '').toLowerCase().includes(q) ||
      (it.keywords || '').toLowerCase().includes(q);

    const nav = navItems.filter(match);
    const actions = actionItems.filter(match);
    // Transactions are noisy — show recent 6 by default, more once searching.
    const txns = (q ? transactionItems.filter(match) : transactionItems.slice(0, 6));

    const out: { group: string; items: CommandItem[] }[] = [];
    if (nav.length) out.push({ group: 'Navigation', items: nav });
    if (actions.length) out.push({ group: 'Actions', items: actions });
    if (txns.length) out.push({ group: q ? 'Transactions' : 'Recent transactions', items: txns.slice(0, 8) });
    return out;
  }, [query, navItems, actionItems, transactionItems]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  // Clamp at render (results can shrink) rather than syncing via an effect.
  const safeIndex = flat.length === 0 ? 0 : Math.min(index, flat.length - 1);

  // Keyboard navigation while open.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => (flat.length ? (i + 1) % flat.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        flat[safeIndex]?.run();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [flat, safeIndex, onClose]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, []);

  // Keep the highlighted row on screen. Without this the list scrolls but the
  // arrow keys do not: the cursor walks off the bottom and the palette looks
  // frozen while it is in fact several rows below the fold.
  useEffect(() => {
    const y = rowOffsets.current[safeIndex];
    if (y === undefined) return;
    // A row height of margin either side, so the cursor is never flush against
    // the edge with no visible context.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 56), animated: false });
  }, [safeIndex]);

  let running = -1; // running flat index across groups

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
        <View style={[styles.searchRow, { borderBottomColor: theme.outlineVariant }]}>
          <Feather name="search" size={18} color={theme.onSurfaceVariant} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={(t) => {
              onQueryChange(t);
              setIndex(0);
            }}
            placeholder="Search pages, actions, transactions…"
            placeholderTextColor={theme.onSurfaceVariant}
            style={[styles.input, { color: theme.onSurface, outlineWidth: 0 } as any]}
          />
          <View style={[styles.escHint, { borderColor: theme.outlineVariant }]}>
            <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontSize: 11 }}>ESC</ThemedText>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.results}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {flat.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="small" themeColor="onSurfaceVariant">No results for &ldquo;{query}&rdquo;</ThemedText>
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.group} style={{ marginBottom: Spacing.two }}>
                <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.groupHeader}>{g.group}</ThemedText>
                {g.items.map((it) => {
                  running += 1;
                  const active = running === safeIndex;
                  const rowIndex = running;
                  return (
                    <Pressable
                      key={it.id}
                      onPress={it.run}
                      onLayout={(e) => {
                        rowOffsets.current[rowIndex] = e.nativeEvent.layout.y;
                      }}
                      onHoverIn={() => setIndex(rowIndex)}
                      style={[styles.row, active && { backgroundColor: theme.primary + '14' }]}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: active ? theme.primary + '22' : theme.surfaceVariant }]}>
                        <Feather name={it.icon} size={15} color={active ? theme.primary : theme.onSurfaceVariant} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="small" numberOfLines={1} style={{ fontWeight: '600' }}>{it.title}</ThemedText>
                        {it.subtitle ? (
                          <ThemedText type="small" themeColor="onSurfaceVariant" numberOfLines={1} style={{ fontSize: 11 }}>{it.subtitle}</ThemedText>
                        ) : null}
                      </View>
                      {active ? (
                        <View style={[styles.enterHint, { borderColor: theme.outlineVariant }]}>
                          <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontSize: 11 }}>↵</ThemedText>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      </View>
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
    zIndex: 9999,
    alignItems: 'center',
    paddingTop: 96,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    width: '100%',
    maxWidth: 560,
    maxHeight: 460,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    // A column, so the search row keeps its height and the results take
    // whatever is left — which is what gives them something to scroll inside.
    flexDirection: 'column',
    boxShadow: '0px 20px 50px rgba(0,0,0,0.25)',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    height: 56,
    borderBottomWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  escHint: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  results: {
    // flexShrink, not flex:1 — the panel must still hug a short list rather
    // than stretching to 460px to show three items.
    flexShrink: 1,
    minHeight: 0,
  },
  resultsContent: {
    padding: Spacing.two,
    paddingTop: Spacing.three,
  },
  groupHeader: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: Spacing.three,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 9,
    borderRadius: 10,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterHint: {
    borderWidth: 1,
    borderRadius: 6,
    minWidth: 22,
    alignItems: 'center',
    paddingVertical: 2,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
  },
});
