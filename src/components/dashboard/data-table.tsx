import { ThemedText } from '@/components/themed-text';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Spacing } from '@/constants/theme';
import { useDensity } from '@/hooks/use-density';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/utils/color';
import { SymbolView } from 'expo-symbols';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export type SortDirection = 'asc' | 'desc';

export interface Column<T> {
  key: string;
  header: string;
  /** Flex weight for the column (default 1). */
  flex?: number;
  align?: 'left' | 'center' | 'right';
  /** When set, the header cell is clickable and calls `onSort(sortKey)`. */
  sortKey?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  onRowPress?: (row: T) => void;
  emptyText?: string;

  /** Controlled sort state (the parent owns the sort — e.g. `useRecords`). */
  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (sortKey: string) => void;

  /** Row selection. When `selectable`, a checkbox column is prepended. */
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: (ids: string[], allSelected: boolean) => void;

  /** Rows per page (default 12). Paging is internal; changing `rows` resets it. */
  pageSize?: number;
}

const CHECKBOX_WIDTH = 44;

function alignItemsFor(align?: 'left' | 'center' | 'right') {
  return align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
}

/**
 * A dense, sortable, paginated desktop table — the web replacement for the
 * mobile card lists on Records/Clients. Sort is controlled by the parent so it
 * can reuse the same in-memory sort the hooks already do; pagination and the
 * optional select-all live locally.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading = false,
  onRowPress,
  emptyText = 'Nothing to show.',
  sortKey,
  sortDirection,
  onSort,
  selectable = false,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
  pageSize = 12,
}: DataTableProps<T>) {
  const theme = useTheme();
  const density = useDensity();
  const rowPadV = density === 'compact' ? 6 : Spacing.three;
  const [page, setPage] = useState(0);

  // A new/filtered/re-sorted list should always start back at the first page.
  // Reset during render (the sanctioned pattern) rather than in an effect.
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPage(0);
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const pageRows = useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = rows.length > 0 && rows.every((r) => selectedSet.has(getRowId(r)));

  const renderHeaderCell = (col: Column<T>) => {
    const active = !!col.sortKey && col.sortKey === sortKey;
    const content = (
      <View
        style={[styles.headerCellInner, { justifyContent: alignItemsFor(col.align) }]}
      >
        <ThemedText
          type="smallBold"
          themeColor={active ? 'onSurface' : 'onSurfaceVariant'}
          style={styles.headerText}
        >
          {col.header}
        </ThemedText>
        {col.sortKey ? (
          <SymbolView
            name={
              active && sortDirection === 'asc'
                ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
            }
            size={13}
            tintColor={active ? theme.primary : withAlpha(theme.onSurfaceVariant, 0.4)}
          />
        ) : null}
      </View>
    );

    if (!col.sortKey || !onSort) {
      return (
        <View key={col.key} style={[styles.cell, { flex: col.flex ?? 1 }]}>
          {content}
        </View>
      );
    }
    return (
      <Pressable
        key={col.key}
        onPress={() => onSort(col.sortKey as string)}
        style={({ pressed }) => [styles.cell, { flex: col.flex ?? 1 }, pressed && { opacity: 0.6 }]}
      >
        {content}
      </Pressable>
    );
  };

  return (
    <View>
      {/* Header row */}
      <View style={[styles.tr, styles.headerRow, { borderBottomColor: theme.outlineVariant, backgroundColor: withAlpha(theme.surfaceVariant, 0.35) }]}>
        {selectable ? (
          <View style={[styles.checkboxCell]}>
            <Checkbox
              checked={allSelected}
              onPress={() => onToggleSelectAll?.(rows.map(getRowId), allSelected)}
            />
          </View>
        ) : null}
        {columns.map(renderHeaderCell)}
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ padding: Spacing.three, gap: Spacing.three }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <LoadingSkeleton key={i} height={28} borderRadius={8} />
          ))}
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <SymbolView
            name={{ ios: 'tray', android: 'inbox', web: 'inbox' }}
            size={26}
            tintColor={theme.onSurfaceVariant}
          />
          <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginTop: Spacing.two }}>
            {emptyText}
          </ThemedText>
        </View>
      ) : (
        pageRows.map((row) => {
          const id = getRowId(row);
          const selected = selectedSet.has(id);
          return (
            <Pressable
              key={id}
              onPress={onRowPress ? () => onRowPress(row) : undefined}
              style={({ pressed }) => [
                styles.tr,
                { paddingVertical: rowPadV, borderBottomColor: theme.outlineVariant },
                selected && { backgroundColor: theme.primary + '10' },
                pressed && onRowPress && { backgroundColor: theme.surfaceVariant },
              ]}
            >
              {selectable ? (
                <View style={styles.checkboxCell}>
                  <Checkbox
                    checked={selected}
                    onPress={() => onToggleSelect?.(id)}
                  />
                </View>
              ) : null}
              {columns.map((col) => (
                <View
                  key={col.key}
                  style={[styles.cell, styles.bodyCell, { flex: col.flex ?? 1, alignItems: alignItemsFor(col.align) }]}
                >
                  {col.render(row)}
                </View>
              ))}
            </Pressable>
          );
        })
      )}

      {/* Footer / pagination */}
      {!loading && rows.length > 0 ? (
        <View style={[styles.footer, { borderTopColor: theme.outlineVariant }]}>
          <ThemedText type="small" themeColor="onSurfaceVariant">
            Showing {start + 1}–{Math.min(start + pageSize, rows.length)} of {rows.length}
          </ThemedText>
          <View style={styles.pager}>
            <PagerButton
              icon={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
              disabled={safePage === 0}
              onPress={() => setPage((p) => Math.max(0, p - 1))}
            />
            <ThemedText type="small" themeColor="onSurfaceVariant" style={{ minWidth: 84, textAlign: 'center' }}>
              Page {safePage + 1} of {pageCount}
            </ThemedText>
            <PagerButton
              icon={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              disabled={safePage >= pageCount - 1}
              onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Checkbox({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={(e) => {
        // Don't let a checkbox tap also trigger the row's onPress.
        e.stopPropagation?.();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.checkbox,
        {
          borderColor: checked ? theme.primary : theme.outline,
          backgroundColor: checked ? theme.primary : 'transparent',
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      {checked ? (
        <SymbolView
          name={{ ios: 'checkmark', android: 'check', web: 'check' }}
          size={12}
          tintColor={theme.onPrimary}
        />
      ) : null}
    </Pressable>
  );
}

function PagerButton({
  icon,
  disabled,
  onPress,
}: {
  icon: { ios: string; android: string; web: string };
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.pagerBtn,
        { borderColor: theme.outlineVariant },
        disabled && { opacity: 0.4 },
        pressed && !disabled && { backgroundColor: theme.surfaceVariant },
      ]}
    >
      <SymbolView name={icon as any} size={16} tintColor={theme.onSurfaceVariant} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  cell: {
    paddingHorizontal: Spacing.two,
  },
  bodyCell: {
    flexDirection: 'row',
  },
  headerCellInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerText: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontSize: 11,
  },
  checkboxCell: {
    width: CHECKBOX_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pagerBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
