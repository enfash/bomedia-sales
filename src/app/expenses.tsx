import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Platform, ActivityIndicator, TextInput, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { Button } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { db } from '@/lib/firebase';
import { ref, push, set, onValue, query, orderByChild } from 'firebase/database';
import { useSettings } from '@/context/settings-context';

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

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  
  // Form state
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter state
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Fetch expenses for selected month
  useEffect(() => {
    setLoading(true);
    const expensesRef = ref(db, `expenses/${selectedMonth}`);
    const unsubscribe = onValue(expensesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const recordsArray = Object.keys(data).map(key => ({
          ...data[key],
          id: key,
          dbPath: `expenses/${selectedMonth}/${key}`
        }));
        
        // Sort descending by date
        recordsArray.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setExpenses(recordsArray);
      } else {
        setExpenses([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedMonth]);

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
      
      const expensesRef = ref(db, `expenses/${monthBucket}`);
      const newExpenseRef = push(expensesRef);
      
      const newExpense = {
        amount: numAmount,
        category,
        description: description.trim(),
        loggedBy: 'Admin',
        createdAt: date.toISOString(),
      };
      
      await set(newExpenseRef, newExpense);
      
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

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentInset={insets}
        contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
      >
        <ThemedView style={styles.container}>
          <ThemedView style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>Expenses Logger</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Track daily expenses cleanly bucked by month.
            </ThemedText>
          </ThemedView>

          <View style={styles.layout}>
            {/* Form Column */}
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText style={styles.cardTitle}>Log New Expense</ThemedText>
              
              <View style={styles.formGroup}>
                <ThemedText themeColor="textSecondary" style={styles.label}>Amount (₦)</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                  placeholder="e.g. 5000"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText themeColor="textSecondary" style={styles.label}>Category</ThemedText>
                <View style={styles.categoryChips}>
                  {CATEGORIES.map(cat => (
                    <Button
                      key={cat}
                      mode={category === cat ? 'contained' : 'outlined'}
                      onPress={() => setCategory(cat)}
                      style={styles.chip}
                      buttonColor={category === cat ? theme.primary : undefined}
                      textColor={category === cat ? '#fff' : theme.text}
                    >
                      {cat}
                    </Button>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <ThemedText themeColor="textSecondary" style={styles.label}>Description</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                  placeholder="What was this expense for?"
                  placeholderTextColor={theme.textSecondary}
                  value={description}
                  onChangeText={setDescription}
                />
              </View>

              <Button
                mode="contained"
                onPress={handleLogExpense}
                loading={submitting}
                disabled={submitting}
                style={[styles.submitBtn, { backgroundColor: theme.primary }]}
              >
                Log Expense
              </Button>
            </ThemedView>

            {/* List Column */}
            <ThemedView type="backgroundElement" style={[styles.card, styles.listCard]}>
              <View style={styles.listHeader}>
                <View>
                  <ThemedText style={styles.cardTitle}>Monthly Expenses</ThemedText>
                  <ThemedText themeColor="textSecondary" style={{ fontSize: 13, marginTop: 4 }}>
                    {new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </ThemedText>
                </View>
                <View style={styles.totalBadge}>
                  <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>
                    ₦{totalMonthlyExpenses.toLocaleString()}
                  </ThemedText>
                </View>
              </View>

              {loading ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={theme.primary} />
                </View>
              ) : expenses.length === 0 ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <SymbolView name={{ ios: 'receipt', android: 'receipt', web: 'receipt' }} size={40} tintColor={theme.textSecondary} />
                  <ThemedText style={{ marginTop: 12, color: theme.textSecondary }}>No expenses logged this month.</ThemedText>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableWrapper}>
                  <View style={{ minWidth: 600 }}>
                    <View style={[styles.tableHeader, { borderBottomColor: theme.backgroundSelected }]}>
                      <Text style={[styles.th, { width: 100, color: theme.textSecondary }]}>Date</Text>
                      <Text style={[styles.th, { width: 220, color: theme.textSecondary }]}>Description</Text>
                      <Text style={[styles.th, { width: 160, color: theme.textSecondary }]}>Category</Text>
                      <Text style={[styles.th, { width: 120, color: theme.textSecondary, textAlign: 'right' }]}>Amount</Text>
                    </View>

                    {expenses.map((item, idx) => (
                      <View key={item.id} style={[styles.tableRow, { borderBottomColor: theme.backgroundSelected }, idx === expenses.length - 1 && { borderBottomWidth: 0 }]}>
                        <Text style={[styles.td, { width: 100, color: theme.textSecondary, paddingRight: 8 }]} numberOfLines={1}>
                          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </Text>
                        <Text style={[styles.td, { width: 220, color: theme.text, fontWeight: '500', paddingRight: 8 }]} numberOfLines={2}>
                          {item.description}
                        </Text>
                        <View style={{ width: 160, flexDirection: 'row', alignItems: 'center', paddingRight: 8 }}>
                           <View style={[styles.inlineChip, { backgroundColor: theme.backgroundSelected }]}>
                             <Text style={[styles.inlineChipText, { color: theme.textSecondary }]} numberOfLines={1}>{item.category}</Text>
                           </View>
                        </View>
                        <Text style={[styles.td, { width: 120, color: (theme.error || '#FF3B30'), textAlign: 'right', fontWeight: '600' }]} numberOfLines={1}>
                          -₦{item.amount.toLocaleString()}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </ThemedView>
          </View>
        </ThemedView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    width: '100%',
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
  layout: {
    flexDirection: 'column',
    gap: Spacing.five,
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    boxShadow: '0px 4px 10px rgba(0,0,0,0.05)',
  },
  listCard: {
    padding: 0, // table card doesn't need outer padding
    overflow: 'hidden',
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
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
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
    padding: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  totalBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tableWrapper: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  th: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  td: {
    fontSize: 14,
  },
  inlineChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  inlineChipText: {
    fontSize: 12,
    fontWeight: '500',
  }
});
