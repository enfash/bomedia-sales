import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ExpenseCard } from '@/components/ui/expense-card';
import { PageContainer } from '@/components/ui/page-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ThemedTextInput } from '@/components/ui/themed-text-input';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useExpenses } from '@/hooks/use-expenses';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { useTheme } from '@/hooks/use-theme';
import { describeWriteError } from '@/utils/errors';
import { logActivity } from '@/services/activity';
import { createExpense, type ExpenseRecord } from '@/services/expense-repository';
import { formatCurrency } from '@/utils/currency';
import { formatDate, isToday as isTodayIso } from '@/utils/date';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button, Surface } from 'react-native-paper';

export type { ExpenseRecord };

/**
 * All 21 `expense_category` enum values, grouped into the 6 sections the
 * picker has always shown — a UI grouping, not a schema one (the DB enum is
 * the source of truth; see supabase/migrations for it). Every value here
 * must be a real enum member or the insert is rejected outright.
 */
const CATEGORY_SECTIONS: { label: string; categories: string[] }[] = [
  {
    label: 'Materials & Printing',
    categories: [
      'Raw Materials', 'Ink',
      'SAV 3ft', 'SAV 4ft', 'SAV 5ft', 'SAV 7ft',
      'Flex 3ft', 'Flex 4ft', 'Flex 5ft', 'Flex 6ft', 'Flex 7ft', 'Flex 8ft', 'Flex 10ft',
    ],
  },
  { label: 'Power & Transport', categories: ['Transport', 'Utilities'] },
  { label: 'Maintenance', categories: ['Maintenance', 'Equipment'] },
  { label: 'Office Supplies', categories: ['Office Supplies', 'Marketing'] },
  { label: 'Salaries', categories: ['Salaries'] },
  { label: 'Miscellaneous', categories: ['Miscellaneous'] },
];

const DEFAULT_CATEGORY = CATEGORY_SECTIONS[0].categories[0];

type SortKey = 'date' | 'amount' | 'category' | 'description';
type SortDir = 'asc' | 'desc';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'category', label: 'Category' },
  { key: 'description', label: 'Name' },
];

export default function ExpensesScreen() {
  const theme = useTheme();
  const { user, isAdmin, actor } = useAuth();

  // 'list' = logged expenses (default); 'new' = the entry form.
  const [mode, setMode] = useState<'list' | 'new'>('list');

  // Form state
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [selectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const { expenses: allExpenses, loading, refresh } = useExpenses(selectedMonth);
  const { refreshing, onRefresh } = usePullRefresh([refresh]);

  // Role scoping: staff only see the expenses they logged today. Admins see all.
  const expenses = useMemo(() => {
    if (isAdmin) return allExpenses;
    return allExpenses.filter((e) => e.uid === user?.uid && isTodayIso(e.createdAt));
  }, [allExpenses, isAdmin, user?.uid]);

  const total = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);

  const sorted = useMemo(() => {
    const arr = [...expenses];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortKey === 'amount') {
        cmp = a.amount - b.amount;
      } else if (sortKey === 'category') {
        cmp = (a.category || '').localeCompare(b.category || '');
      } else {
        cmp = (a.description || '').localeCompare(b.description || '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [expenses, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Newest / biggest first feels natural for date & amount; A→Z for text.
      setSortDir(key === 'category' || key === 'description' ? 'asc' : 'desc');
    }
  };

  const handleLogExpense = async () => {
    const numAmount = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Missing description', 'Please provide a description.');
      return;
    }

    setSubmitting(true);
    try {
      await createExpense({
        amount: numAmount,
        category,
        description: description.trim(),
        // logged_by (uid) is required by RLS for staff-created expenses
        // (the insert policy checks logged_by = auth.uid()); also drives the
        // staff "own expenses only" filter below. loggedBy.name is a
        // snapshot written once at insert time — see the migration that
        // added expenses.logged_by_name for why it isn't a live join.
        loggedBy: { uid: user?.uid ?? '', name: actor.name },
      });

      logActivity({
        type: 'expense_logged',
        actor: actor,
        message: `${actor.name} logged a ${formatCurrency(numAmount)} expense (${category})`,
        meta: { amount: numAmount, category },
      });

      setAmount('');
      setDescription('');
      setCategory(DEFAULT_CATEGORY);
      setMode('list');
    } catch (error) {
      console.error('Error logging expense:', error);
      const message = describeWriteError(error, 'log this expense');
      Alert.alert(message.title, message.body);
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------- FORM ---------------------------------- */
  if (mode === 'new') {
    return (
      <PageContainer>
        <ThemedView style={styles.container}>
          <View style={styles.formHeader}>
            <Pressable
              onPress={() => setMode('list')}
              style={[styles.backBtn, { borderColor: theme.surfaceVariant }]}
              hitSlop={8}
            >
              <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor={theme.onSurface} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <ThemedText type="subtitle" style={styles.title}>Log New Expense</ThemedText>
              <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
                Record a cost — it&apos;s bucketed into this month automatically.
              </ThemedText>
            </View>
          </View>

          <Surface elevation={1} style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.formGroup}>
              <ThemedText themeColor="onSurfaceVariant" style={styles.label}>Amount (₦)</ThemedText>
              <ThemedTextInput
                dense
                style={{ backgroundColor: theme.background }}
                placeholder="e.g. 5000"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText themeColor="onSurfaceVariant" style={styles.label}>Category</ThemedText>
              <View style={{ gap: Spacing.three }}>
                {CATEGORY_SECTIONS.map((section) => (
                  <View key={section.label}>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.sectionLabel}>
                      {section.label}
                    </ThemedText>
                    <View style={styles.categoryChips}>
                      {section.categories.map((cat) => (
                        <Button
                          key={cat}
                          compact
                          mode={category === cat ? 'contained' : 'outlined'}
                          onPress={() => setCategory(cat)}
                          style={styles.chip}
                        >
                          {cat}
                        </Button>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <ThemedText themeColor="onSurfaceVariant" style={styles.label}>Description</ThemedText>
              <ThemedTextInput
                dense
                style={{ backgroundColor: theme.background }}
                placeholder="What was this expense for?"
                value={description}
                onChangeText={setDescription}
              />
            </View>

            <PrimaryButton
              onPress={handleLogExpense}
              loading={submitting}
              disabled={submitting}
              style={{ marginTop: Spacing.two }}
            >
              Log Expense
            </PrimaryButton>
          </Surface>
        </ThemedView>
      </PageContainer>
    );
  }

  /* ---------------------------------- LIST ---------------------------------- */
  return (
    <PageContainer refreshing={refreshing} onRefresh={onRefresh}>
      <ThemedView style={styles.container}>
        <View style={[styles.formHeader, { alignItems: 'center' }]}>
          <View style={{ flex: 1 }}>
            <ThemedText type="subtitle" style={styles.title}>Expenses</ThemedText>
            <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
              Track daily spend, bucketed by month.
            </ThemedText>
          </View>
          <Pressable
            onPress={() => setMode('new')}
            style={[styles.addBtn, { backgroundColor: theme.primary }]}
            accessibilityLabel="Add expense"
          >
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={theme.onPrimary} />
            <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>Add Expense</ThemedText>
          </Pressable>
        </View>

        {/* Monthly total summary */}
        <Surface elevation={0} style={[styles.summary, { backgroundColor: theme.surfaceVariant }]}>
          <View>
            <ThemedText type="small" themeColor="onSurfaceVariant">
              {isAdmin
                ? formatDate(selectedMonth + '-01', { month: 'long', year: 'numeric' })
                : 'Today'}
            </ThemedText>
            <ThemedText type="small" themeColor="onSurfaceVariant">
              {expenses.length} {expenses.length === 1 ? 'entry' : 'entries'}
            </ThemedText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <ThemedText type="small" themeColor="onSurfaceVariant">Total spent</ThemedText>
            <ThemedText type="subtitle" style={{ color: theme.error, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {formatCurrency(total)}
            </ThemedText>
          </View>
        </Surface>

        {/* Sort controls */}
        <View style={styles.sortRow}>
          <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginRight: Spacing.one }}>Sort by</ThemedText>
          {SORTS.map((s) => {
            const active = sortKey === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => handleSort(s.key)}
                style={[
                  styles.sortPill,
                  { borderColor: theme.surfaceVariant },
                  active && { backgroundColor: theme.primary, borderColor: theme.primary },
                ]}
              >
                <ThemedText type="smallBold" style={{ color: active ? theme.onPrimary : theme.onSurfaceVariant, fontSize: 12 }}>
                  {s.label}
                </ThemedText>
                {active ? (
                  <SymbolView
                    name={
                      sortDir === 'asc'
                        ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                        : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
                    }
                    size={12}
                    tintColor={theme.onPrimary}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* List */}
        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : expenses.length === 0 ? (
          <Surface elevation={0} style={[styles.emptyCard, { backgroundColor: theme.surfaceVariant }]}>
            <SymbolView name={{ ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' }} size={30} tintColor={theme.onSurfaceVariant} />
            <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginTop: Spacing.two, textAlign: 'center' }}>
              No expenses yet. Tap &ldquo;Add Expense&rdquo; to log your first one.
            </ThemedText>
          </Surface>
        ) : (
          <View style={styles.list}>
            {sorted.map((item) => (
              <ExpenseCard
                key={item.id}
                description={item.description}
                category={item.category}
                date={formatDate(item.createdAt, { month: 'short', day: 'numeric' })}
                amount={`-${formatCurrency(item.amount)}`}
              />
            ))}
          </View>
        )}
      </ThemedView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: Spacing.four },
  formHeader: { flexDirection: 'row', gap: Spacing.three, paddingHorizontal: Spacing.four },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 12 },
  title: { fontWeight: '700' },
  subtitle: { fontSize: 14 },
  card: { borderRadius: 16, padding: Spacing.four, marginHorizontal: Spacing.four },
  formGroup: { marginBottom: Spacing.four },
  label: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.two, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: Spacing.one },
  categoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: Spacing.two },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Spacing.four,
    borderRadius: 16,
    padding: Spacing.four,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 999,
  },
  list: { gap: Spacing.three, paddingHorizontal: Spacing.four },
  emptyCard: { marginHorizontal: Spacing.four, borderRadius: 16, padding: Spacing.five, alignItems: 'center' },
});
