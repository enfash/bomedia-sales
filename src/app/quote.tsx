import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/currency';

interface QuoteItem {
  id: string;
  client: string;
  project: string;
  value: number;
  status: 'Approved' | 'Sent' | 'Draft' | 'Expired';
  date: string;
}

const INITIAL_QUOTES: QuoteItem[] = [
  { id: '1', client: 'Acme Corp', project: 'Website Redesign', value: 8500, status: 'Approved', date: '2026-07-10' },
  { id: '2', client: 'Stark Industries', project: 'Portal Security App', value: 45000, status: 'Sent', date: '2026-07-08' },
  { id: '3', client: 'Wayne Enterprises', project: 'SEO & Growth Campaign', value: 3600, status: 'Draft', date: '2026-07-12' },
  { id: '4', client: 'Globex Corp', project: 'Brand Guidelines', value: 1200, status: 'Expired', date: '2026-06-25' },
];

export default function QuoteScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Estimator State
  const [clientName, setClientName] = useState('');
  const [service, setService] = useState<'web' | 'marketing' | 'branding' | 'custom'>('web');
  const [months, setMonths] = useState<number>(3);
  const [hasSupport, setHasSupport] = useState<boolean>(true);
  const [quotes, setQuotes] = useState<QuoteItem[]>(INITIAL_QUOTES);
  const [successMsg, setSuccessMsg] = useState('');

  type SortField = 'client' | 'project' | 'date' | 'value' | 'status';
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedQuotes = [...quotes].sort((a, b) => {
    let comparison = 0;
    if (a[sortField] < b[sortField]) comparison = -1;
    if (a[sortField] > b[sortField]) comparison = 1;
    return sortAsc ? comparison : -comparison;
  });

  // Calculation Logic
  const getBaseRate = () => {
    switch (service) {
      case 'web': return 2500;
      case 'marketing': return 1200;
      case 'branding': return 800;
      case 'custom': return 6000;
    }
  };

  const calculateTotal = () => {
    const base = getBaseRate();
    const durationMultiplier = months === 1 ? 1 : months === 3 ? 0.9 : months === 6 ? 0.8 : 0.7; // discount for longer terms
    const monthlyRate = base * durationMultiplier;
    const supportAddon = hasSupport ? 350 * months : 0;
    return Math.round(monthlyRate * months + supportAddon);
  };

  const handleSaveEstimate = () => {
    if (!clientName.trim()) {
      alert('Please enter a Client/Project name.');
      return;
    }
    const newQuote: QuoteItem = {
      id: Date.now().toString(),
      client: clientName,
      project: `${service.toUpperCase()} Design & Dev`,
      value: calculateTotal(),
      status: 'Draft',
      date: new Date().toISOString().split('T')[0],
    };
    setQuotes([newQuote, ...quotes]);
    setClientName('');
    setSuccessMsg('Estimate saved successfully to drafts!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

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
        {/* Header */}
        <ThemedView style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>Quote Estimator</ThemedText>
          <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
            Create instant estimates and manage sales proposals.
          </ThemedText>
        </ThemedView>

        {/* Dynamic Calculator Widget */}
        <ThemedView type="surface" style={styles.card}>
          <ThemedText type="smallBold" style={styles.cardHeader}>Interactive Pricing Calculator</ThemedText>

          <View style={styles.formGroup}>
            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Client Name / Reference</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.onSurface,
                  backgroundColor: theme.background,
                  borderColor: theme.surfaceVariant,
                }
              ]}
              placeholder="e.g. Acme Corp Layout"
              placeholderTextColor={theme.onSurfaceVariant}
              value={clientName}
              onChangeText={setClientName}
            />
          </View>

          <View style={styles.formGroup}>
            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Select Service Type</ThemedText>
            <View style={styles.row}>
              {(['web', 'marketing', 'branding', 'custom'] as const).map((type) => {
                const isSelected = service === type;
                const labels = { web: 'Web Dev', marketing: 'SEO/Mktg', branding: 'Branding', custom: 'Custom App' };
                return (
                  <Pressable
                    key={type}
                    onPress={() => setService(type)}
                    style={[
                      styles.pillButton,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.background,
                        borderColor: theme.surfaceVariant,
                      }
                    ]}
                  >
                    <ThemedText
                      type="smallBold"
                      style={{ color: isSelected ? '#ffffff' : theme.onSurface }}
                    >
                      {labels[type]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.formGroup}>
            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Project Duration</ThemedText>
            <View style={styles.row}>
              {([1, 3, 6, 12] as const).map((duration) => {
                const isSelected = months === duration;
                return (
                  <Pressable
                    key={duration}
                    onPress={() => setMonths(duration)}
                    style={[
                      styles.durationButton,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.background,
                        borderColor: theme.surfaceVariant,
                      }
                    ]}
                  >
                    <ThemedText
                      type="smallBold"
                      style={{ color: isSelected ? '#ffffff' : theme.onSurface }}
                    >
                      {duration} {duration === 1 ? 'Mo' : 'Mos'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            onPress={() => setHasSupport(!hasSupport)}
            style={[styles.checkboxContainer, { borderColor: theme.surfaceVariant }]}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: theme.onSurfaceVariant,
                  backgroundColor: hasSupport ? theme.primary : 'transparent',
                }
              ]}
            >
              {hasSupport && (
                <SymbolView
                  name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                  size={12}
                  tintColor="#ffffff"
                />
              )}
            </View>
            <ThemedText type="small" style={styles.checkboxLabel}>
              Include Premium Maintenance Support (+₦350/mo)
            </ThemedText>
          </Pressable>

          {/* Pricing Result */}
          <View style={[styles.resultContainer, { backgroundColor: theme.background }]}>
            <ThemedText type="small" themeColor="onSurfaceVariant">Estimated Total</ThemedText>
            <ThemedText type="subtitle" style={[styles.totalValue, { color: theme.primary }]}>
              {formatCurrency(calculateTotal())}
            </ThemedText>
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitButton, { backgroundColor: theme.primary }, pressed && styles.pressed]}
            onPress={handleSaveEstimate}
          >
            <ThemedText type="smallBold" style={styles.submitButtonText}>
              Save Estimate As Draft
            </ThemedText>
          </Pressable>

          {successMsg ? (
            <ThemedView type="surfaceVariant" style={styles.successToast}>
              <ThemedText type="small" style={{ color: theme.primary }}>{successMsg}</ThemedText>
            </ThemedView>
          ) : null}
        </ThemedView>

        {/* Recent Quotes */}
        <ThemedView style={styles.quotesSection}>
          <ThemedText type="smallBold" style={styles.sectionHeader}>Recent Sales Quotes</ThemedText>
          {isDesktop ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={{ minWidth: 700, paddingBottom: 16 }}>
                {/* Table Header */}
              <View style={[styles.tableRow, { borderBottomColor: theme.surfaceVariant, borderBottomWidth: 1, paddingVertical: 12 }]}>
                <Pressable style={{ width: 140 }} onPress={() => handleSort('client')}>
                  <ThemedText type="smallBold" themeColor="onSurfaceVariant">Client {sortField === 'client' ? (sortAsc ? '↑' : '↓') : ''}</ThemedText>
                </Pressable>
                <Pressable style={{ width: 200 }} onPress={() => handleSort('project')}>
                  <ThemedText type="smallBold" themeColor="onSurfaceVariant">Project Type {sortField === 'project' ? (sortAsc ? '↑' : '↓') : ''}</ThemedText>
                </Pressable>
                <Pressable style={{ width: 90 }} onPress={() => handleSort('date')}>
                  <ThemedText type="smallBold" themeColor="onSurfaceVariant">Date {sortField === 'date' ? (sortAsc ? '↑' : '↓') : ''}</ThemedText>
                </Pressable>
                <Pressable style={{ width: 100, alignItems: 'flex-end' }} onPress={() => handleSort('value')}>
                  <ThemedText type="smallBold" themeColor="onSurfaceVariant">Amount {sortField === 'value' ? (sortAsc ? '↑' : '↓') : ''}</ThemedText>
                </Pressable>
                <Pressable style={{ width: 80, paddingLeft: 16 }} onPress={() => handleSort('status')}>
                  <ThemedText type="smallBold" themeColor="onSurfaceVariant">Status {sortField === 'status' ? (sortAsc ? '↑' : '↓') : ''}</ThemedText>
                </Pressable>
                <ThemedText type="smallBold" themeColor="onSurfaceVariant" style={{ width: 60, textAlign: 'center' }}>Actions</ThemedText>
              </View>

              {/* Table Body */}
              {sortedQuotes.map((q) => {
                  const statusColors = {
                    Approved: { bg: '#E8F5E9', text: '#2E7D32' },
                    Sent: { bg: '#E5EEFF', text: theme.primary },
                    Draft: { bg: '#FFF4E5', text: '#EF6C00' },
                    Expired: { bg: '#FFDAD6', text: theme.error },
                  };
                  const col = statusColors[q.status];

                  return (
                    <Pressable
                      key={q.id}
                      style={({ pressed, hovered }: any) => [
                        styles.tableRow,
                        {
                          borderBottomColor: 'rgba(0,0,0,0.05)',
                          borderBottomWidth: 1,
                          paddingVertical: 12,
                          backgroundColor: pressed || hovered ? 'rgba(0,0,0,0.02)' : 'transparent',
                        }
                      ]}
                    >
                      <ThemedText type="smallBold" style={{ width: 140, paddingRight: 8 }} numberOfLines={1}>{q.client}</ThemedText>
                      <ThemedText type="small" themeColor="onSurfaceVariant" style={{ width: 200, paddingRight: 8 }} numberOfLines={1}>{q.project}</ThemedText>
                      <ThemedText type="small" themeColor="onSurfaceVariant" style={{ width: 90, paddingRight: 8 }} numberOfLines={1}>{q.date}</ThemedText>
                      <ThemedText type="smallBold" style={{ width: 100, textAlign: 'right', color: theme.onSurface, paddingRight: 8 }} numberOfLines={1}>
                        {formatCurrency(q.value)}
                      </ThemedText>
                      <View style={{ width: 80, paddingLeft: 16, justifyContent: 'center', alignItems: 'flex-start' }}>
                        <View style={[styles.statusBadge, { backgroundColor: col.bg }]}>
                          <ThemedText type="code" style={[styles.statusText, { color: col.text }]} numberOfLines={1}>
                            {q.status}
                          </ThemedText>
                        </View>
                      </View>
                      <View style={{ width: 60, alignItems: 'center', justifyContent: 'center' }}>
                        <SymbolView name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }} size={16} tintColor={theme.onSurfaceVariant} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.quotesList}>
              {sortedQuotes.map((q) => {
                const statusColors = {
                  Approved: { bg: '#E8F5E9', text: '#2E7D32' },
                  Sent: { bg: '#E5EEFF', text: theme.primary },
                  Draft: { bg: '#FFF4E5', text: '#EF6C00' },
                  Expired: { bg: '#FFDAD6', text: theme.error },
                };
                const col = statusColors[q.status];

                return (
                  <ThemedView key={q.id} type="surface" style={styles.quoteCard}>
                    <View style={styles.quoteInfo}>
                      <ThemedText type="smallBold">{q.client}</ThemedText>
                      <ThemedText type="code" themeColor="onSurfaceVariant" style={styles.quoteProject}>
                        {q.project} • {q.date}
                      </ThemedText>
                    </View>
                    <View style={styles.quoteValueSection}>
                      <ThemedText type="smallBold" style={styles.quoteValue}>
                        {formatCurrency(q.value)}
                      </ThemedText>
                      <View style={[styles.statusBadge, { backgroundColor: col.bg }]}>
                        <ThemedText type="code" style={[styles.statusText, { color: col.text }]}>
                          {q.status}
                        </ThemedText>
                      </View>
                    </View>
                  </ThemedView>
                );
              })}
            </View>
          )}
        </ThemedView>
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
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
    width: '100%',
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
    gap: Spacing.three,
    boxShadow: '0px 4px 10px rgba(0,0,0,0.05)',
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: Spacing.one,
  },
  formGroup: {
    gap: Spacing.one,
  },
  label: {
    fontSize: 12,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pillButton: {
    flex: 1,
    minWidth: 75,
    height: 38,
    borderWidth: 1,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  durationButton: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 13,
    flex: 1,
  },
  resultContainer: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  submitButton: {
    height: 48,
    borderRadius: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.8,
  },
  successToast: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    alignItems: 'center',
  },
  quotesSection: {
    marginTop: Spacing.two,
    gap: Spacing.three,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '600',
  },
  quotesList: {
    gap: Spacing.two,
  },
  quoteCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quoteInfo: {
    gap: Spacing.half,
  },
  quoteProject: {
    fontSize: 11,
  },
  quoteValueSection: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  quoteValue: {
    fontSize: 15,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
