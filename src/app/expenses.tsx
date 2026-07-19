import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { Button, TextInput as PaperTextInput, Surface } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePageContainerStyles } from '@/components/ui/page-container';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dbService } from '@/services/db';
import { useExpenses } from '@/hooks/use-expenses';
import { useSettings } from '@/context/settings-context';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { ExpenseCard } from '@/components/ui/expense-card';
import { EmptyState } from '@/components/ui/empty-state';

export interface ExpenseRecord {
  id: string;
  amount: number;
  category: string;
  description: string;
  loggedBy: string;
  createdAt: string;
  dbPath?: string;
}

const CATEGORIES = [
  'Materials & Printing',
  'Fuel & Transport',
  'Maintenance',
  'Office Supplies',
  'Salaries',
  'Miscellaneous'
];

export default function ExpensesScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter state
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const { expenses, loading } = useExpenses(selectedMonth);

  const handleLogExpense = async () => {
    const numAmount = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    if (!description.trim()) {
      alert('Please provide a description.');
      return;
    }

    setSubmitting(true);
    try {
      const date = new Date();
      const monthBucket = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const newExpense = {
        amount: numAmount,
        category,
        description: description.trim(),
        loggedBy: 'Admin',
        createdAt: date.toISOString(),
      };
      
      await dbService.pushRecord(`expenses/${monthBucket}`, newExpense);
      
      // Reset form
      setAmount('');
      setDescription('');
      alert('Expense logged successfully!');
    } catch (error) {
      console.error('Error logging expense:', error);
      alert('Failed to log expense. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalMonthlyExpenses = useMemo(() => {
    return expenses.reduce((sum, item) => sum + item.amount, 0);
  }, [expenses]);

  const { contentStyle } = usePageContainerStyles(false, 80);

  const listHeader = (
    <View style={[styles.headerContainer, { paddingHorizontal: Platform.OS === 'web' ? 0 : Spacing.four }]}>
      <ThemedView style={styles.header}>
        <ThemedText type="subtitle" style={styles.title}>Expenses Logger</ThemedText>
        <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
          Track daily expenses cleanly bucked by month.
        </ThemedText>
      </ThemedView>

      <Surface elevation={1} style={[styles.card, { backgroundColor: theme.surface }]}>
        <ThemedText style={styles.cardTitle}>Log New Expense</ThemedText>
        
        <View style={styles.formGroup}>
          <ThemedText themeColor="onSurfaceVariant" style={styles.label}>Amount (₦)</ThemedText>
          <PaperTextInput
            mode="outlined"
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
          <View style={styles.categoryChips}>
            {CATEGORIES.map(cat => (
              <Button
                key={cat}
                mode={category === cat ? 'contained' : 'outlined'}
                onPress={() => setCategory(cat)}
                style={styles.chip}
              >
                {cat}
              </Button>
            ))}
          </View>
        </View>

        <View style={styles.formGroup}>
          <ThemedText themeColor="onSurfaceVariant" style={styles.label}>Description</ThemedText>
          <PaperTextInput
            mode="outlined"
            dense
            style={{ backgroundColor: theme.background }}
            placeholder="What was this expense for?"
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <Button
          mode="contained"
          onPress={handleLogExpense}
          loading={submitting}
          disabled={submitting}
          style={[styles.submitBtn, { marginTop: 16 }]}
          contentStyle={{ height: 48 }}
        >
          Log Expense
        </Button>
      </Surface>

      <View style={styles.listHeader}>
        <View>
          <ThemedText style={styles.cardTitle}>Monthly Expenses</ThemedText>
          <ThemedText themeColor="onSurfaceVariant" style={{ fontSize: 13, marginTop: 4 }}>
            {formatDate(selectedMonth + '-01', { month: 'long', year: 'numeric' })}
          </ThemedText>
        </View>
        <View style={[styles.totalBadge, { backgroundColor: theme.error || '#FF3B30' }]}>
          <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>
            {formatCurrency(totalMonthlyExpenses)}
          </ThemedText>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={styles.container}>
          {loading ? (
            <View style={[contentStyle, { paddingTop: Spacing.four }]}>
              {listHeader}
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            </View>
          ) : (
            <FlatList
              data={expenses}
              keyExtractor={(item) => item.id}
              contentContainerStyle={contentStyle}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={listHeader}
              ListEmptyComponent={
                <EmptyState
                  iconName="creditcard.fill"
                  title="No expenses yet"
                  message="Add your first expense to get started."
                />
              }
              renderItem={({ item }) => (
                <ExpenseCard
                  description={item.description}
                  category={item.category}
                  date={formatDate(item.createdAt, { month: 'short', day: 'numeric' })}
                  amount={`-${formatCurrency(item.amount)}`}
                />
              )}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    width: '100%',
  },
  headerContainer: {
    gap: Spacing.five,
    marginBottom: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    boxShadow: '0px 4px 10px rgba(0,0,0,0.05)',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.four,
  },
  formGroup: {
    marginBottom: Spacing.four,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 8,
  },
  submitBtn: {
    marginTop: Spacing.two,
    borderRadius: Spacing.two,
    paddingVertical: 4,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  totalBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
});
