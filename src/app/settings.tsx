import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { TextInput as PaperTextInput, Button } from 'react-native-paper';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSettings, MaterialItem, PrinterItem } from '@/context/settings-context';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { PrimaryButton } from '@/components/ui/primary-button';

export default function SettingsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + 16,
  };
  const theme = useTheme();
  const { settings, updateSettings, isLoading } = useSettings();

  // Local state for edits
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [address, setAddress] = useState(settings.address);
  const [contactEmail, setContactEmail] = useState(settings.contactEmail);
  const [contactPhone, setContactPhone] = useState(settings.contactPhone);
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '');
  const [bankDetails, setBankDetails] = useState(settings.bankDetails || '');
  
  const [mov, setMov] = useState(settings.mov.toString());
  const [eyeletCost, setEyeletCost] = useState(settings.eyeletCost.toString());
  const [laminationCost, setLaminationCost] = useState(settings.laminationCost?.toString() || '0');
  const [laborCost, setLaborCost] = useState(settings.laborCost?.toString() || '0');
  const [wasteFactor, setWasteFactor] = useState(settings.wasteFactor?.toString() || '0');
  const [turnaroundStandard, setTurnaroundStandard] = useState(settings.turnaroundStandard?.toString() || '1.0');
  const [turnaroundRush, setTurnaroundRush] = useState(settings.turnaroundRush?.toString() || '1.5');
  const [turnaroundSameDay, setTurnaroundSameDay] = useState(settings.turnaroundSameDay?.toString() || '2.0');

  // Dynamic Lists State
  const [materials, setMaterials] = useState<MaterialItem[]>(settings.materials || []);
  const [printers, setPrinters] = useState<PrinterItem[]>(settings.printers || []);

  // Update local state if settings change from another device or initial load
  useEffect(() => {
    setBusinessName(settings.businessName);
    setAddress(settings.address);
    setContactEmail(settings.contactEmail);
    setContactPhone(settings.contactPhone);
    setLogoUrl(settings.logoUrl || '');
    setBankDetails(settings.bankDetails || '');
    
    setMov(settings.mov.toString());
    setEyeletCost(settings.eyeletCost.toString());
    setLaminationCost(settings.laminationCost?.toString() || '0');
    setLaborCost(settings.laborCost?.toString() || '0');
    setWasteFactor(settings.wasteFactor?.toString() || '0');
    setTurnaroundStandard(settings.turnaroundStandard?.toString() || '1.0');
    setTurnaroundRush(settings.turnaroundRush?.toString() || '1.5');
    setTurnaroundSameDay(settings.turnaroundSameDay?.toString() || '2.0');
    setMaterials(settings.materials || []);
    setPrinters(settings.printers || []);
  }, [settings]);

  type TabType = 'profile' | 'materials' | 'metrics' | 'printers';
  const [activeTab, setActiveTab] = useState<TabType>('profile');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    
    // Filter out empty items
    const validMaterials = materials.filter(m => m.name.trim() !== '');
    const validPrinters = printers.filter(p => p.name.trim() !== '');

    await updateSettings({
      businessName,
      address,
      contactEmail,
      contactPhone,
      logoUrl,
      bankDetails,
      mov: parseFloat(mov) || 0,
      eyeletCost: parseFloat(eyeletCost) || 0,
      materials: validMaterials,
      laminationCost: parseFloat(laminationCost) || 0,
      laborCost: parseFloat(laborCost) || 0,
      wasteFactor: parseFloat(wasteFactor) || 0,
      turnaroundStandard: parseFloat(turnaroundStandard) || 1.0,
      turnaroundRush: parseFloat(turnaroundRush) || 1.5,
      turnaroundSameDay: parseFloat(turnaroundSameDay) || 2.0,
      printers: validPrinters,
    });
    
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const addMaterial = () => {
    setMaterials([...materials, { id: `m-new-${Date.now()}`, name: '', price: 0 }]);
  };

  const updateMaterial = (id: string, field: keyof MaterialItem, value: any) => {
    setMaterials(materials.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  const addPrinter = () => {
    setPrinters([...printers, { id: `p-new-${Date.now()}`, name: '' }]);
  };

  const updatePrinter = (id: string, name: string) => {
    setPrinters(printers.map(p => p.id === id ? { ...p, name } : p));
  };

  const removePrinter = (id: string) => {
    setPrinters(printers.filter(p => p.id !== id));
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

  if (isLoading) {
    return (
      <View style={[styles.mainContainer, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText style={{ marginTop: 16 }}>Loading settings...</ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentInset={insets}
        contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
      >
        <ThemedView style={styles.container}>
          {/* Top App Bar Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTextContainer}>
              <ThemedText type="subtitle" style={styles.title}>Settings</ThemedText>
              <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
                Manage operational metrics and business profile
              </ThemedText>
            </View>
            
            <Button
              mode="contained"
              onPress={handleSave}
              loading={isSaving}
              disabled={isSaving}
              icon={saveSuccess ? "check" : "content-save"}
              buttonColor={saveSuccess ? '#10B981' : theme.primary}
            >
              {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Changes'}
            </Button>
          </View>

          {/* Segmented Control Navigation */}
          <View style={[styles.tabSelector, { backgroundColor: theme.surfaceVariant }]}>
            {(['profile', 'materials', 'metrics', 'printers'] as TabType[]).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  style={[
                    styles.tabButton,
                    isActive && [styles.activeTabButton, { backgroundColor: theme.background }]
                  ]}
                  onPress={() => setActiveTab(tab)}
                >
                  <ThemedText
                    type="smallBold"
                    style={{ color: isActive ? theme.primary : theme.onSurfaceVariant }}
                  >
                    {tab === 'profile' && 'Profile'}
                    {tab === 'materials' && 'Materials'}
                    {tab === 'metrics' && 'Operational'}
                    {tab === 'printers' && 'Printers'}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Form Content */}
          <View style={{ gap: 24 }}>
            {activeTab === 'profile' && (
              <ThemedView type="surface" style={styles.card}>
                <ThemedText type="smallBold" style={[styles.cardHeader, { borderBottomColor: theme.outline }]}>Business Profile</ThemedText>
                
                <View style={styles.formGroup}>
                  <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Business Name</ThemedText>
                  <PaperTextInput
                    mode="outlined"
                    dense
                    style={{ backgroundColor: theme.background }}
                    value={businessName}
                    onChangeText={setBusinessName}
                  />
                </View>

                <View style={styles.formGroup}>
                  <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Address</ThemedText>
                  <PaperTextInput
                    mode="outlined"
                    dense
                    style={{ backgroundColor: theme.background }}
                    value={address}
                    onChangeText={setAddress}
                  />
                </View>

                <View style={styles.row}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Contact Email</ThemedText>
                    <PaperTextInput
                      mode="outlined"
                      dense
                      style={{ backgroundColor: theme.background }}
                      value={contactEmail}
                      onChangeText={setContactEmail}
                      keyboardType="email-address"
                    />
                  </View>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Contact Phone</ThemedText>
                    <PaperTextInput
                      mode="outlined"
                      dense
                      style={{ backgroundColor: theme.background }}
                      value={contactPhone}
                      onChangeText={setContactPhone}
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Logo URL (optional)</ThemedText>
                  <PaperTextInput
                    mode="outlined"
                    dense
                    style={{ backgroundColor: theme.background }}
                    value={logoUrl}
                    onChangeText={setLogoUrl}
                    placeholder="https://example.com/logo.png"
                  />
                </View>

                <View style={styles.formGroup}>
                  <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Bank Details (For Invoices)</ThemedText>
                  <PaperTextInput
                    mode="outlined"
                    style={{ backgroundColor: theme.background, minHeight: 100 }}
                    value={bankDetails}
                    onChangeText={setBankDetails}
                    multiline
                  />
                </View>
              </ThemedView>
            )}

            {activeTab === 'metrics' && (
              <ThemedView type="surface" style={styles.card}>
                <ThemedText type="smallBold" style={[styles.cardHeader, { borderBottomColor: theme.outline }]}>Operational Metrics</ThemedText>
                
                <View style={styles.formGroup}>
                  <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Minimum Order Value (MOV) - ₦</ThemedText>
                  <PaperTextInput
                    mode="outlined"
                    dense
                    style={{ backgroundColor: theme.background }}
                    value={mov}
                    onChangeText={setMov}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.row}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Eyelet Cost (₦)</ThemedText>
                    <PaperTextInput
                      mode="outlined"
                      dense
                      style={{ backgroundColor: theme.background }}
                      value={eyeletCost}
                      onChangeText={setEyeletCost}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Waste Factor (%)</ThemedText>
                    <PaperTextInput
                      mode="outlined"
                      dense
                      style={{ backgroundColor: theme.background }}
                      value={wasteFactor}
                      onChangeText={setWasteFactor}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Lamination Cost (/SqFt ₦)</ThemedText>
                    <PaperTextInput
                      mode="outlined"
                      dense
                      style={{ backgroundColor: theme.background }}
                      value={laminationCost}
                      onChangeText={setLaminationCost}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Labor / Welding (Flat ₦)</ThemedText>
                    <PaperTextInput
                      mode="outlined"
                      dense
                      style={{ backgroundColor: theme.background }}
                      value={laborCost}
                      onChangeText={setLaborCost}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <ThemedText type="smallBold" style={{ marginTop: 12, marginBottom: -4 }}>Turnaround Multipliers</ThemedText>
                <View style={styles.row}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Standard</ThemedText>
                    <PaperTextInput
                      mode="outlined"
                      dense
                      style={{ backgroundColor: theme.background }}
                      value={turnaroundStandard}
                      onChangeText={setTurnaroundStandard}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Rush</ThemedText>
                    <PaperTextInput
                      mode="outlined"
                      dense
                      style={{ backgroundColor: theme.background }}
                      value={turnaroundRush}
                      onChangeText={setTurnaroundRush}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Same Day</ThemedText>
                    <PaperTextInput
                      mode="outlined"
                      dense
                      style={{ backgroundColor: theme.background }}
                      value={turnaroundSameDay}
                      onChangeText={setTurnaroundSameDay}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </ThemedView>
            )}

            {activeTab === 'materials' && (
              <ThemedView type="surface" style={styles.card}>
                <View style={[styles.cardHeaderRow, { borderBottomColor: theme.outline }]}>
                  <ThemedText type="smallBold" style={styles.cardHeaderNoMargin}>Materials & Pricing</ThemedText>
                  <Button mode="outlined" onPress={addMaterial} icon="plus">
                    Add New
                  </Button>
                </View>
                
                <View style={styles.listContainer}>
                  {materials.map((material) => (
                    <View key={material.id} style={styles.dynamicRow}>
                      <View style={{ flex: 2, gap: 4 }}>
                        <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Name</ThemedText>
                        <PaperTextInput
                          mode="outlined"
                          dense
                          style={{ backgroundColor: theme.background }}
                          placeholder="e.g. SAV Default"
                          value={material.name}
                          onChangeText={(text) => updateMaterial(material.id, 'name', text)}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Price ₦</ThemedText>
                        <PaperTextInput
                          mode="outlined"
                          dense
                          style={{ backgroundColor: theme.background }}
                          placeholder="0.00"
                          keyboardType="numeric"
                          value={material.price.toString()}
                          onChangeText={(text) => {
                            const val = text === '' ? '' : parseFloat(text);
                            updateMaterial(material.id, 'price', isNaN(val as number) ? 0 : val);
                          }}
                        />
                      </View>
                      <View style={{ paddingTop: 24 }}>
                        <Pressable onPress={() => removeMaterial(material.id)} style={[styles.deleteButton, { backgroundColor: (theme.error || '#FF3B30') + '1A' }]}>
                          <SymbolView name={{ ios: 'trash.fill', android: 'delete', web: 'delete' }} size={18} tintColor={theme.error || '#FF3B30'} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  {materials.length === 0 && (
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={{ textAlign: 'center', padding: 24 }}>
                      No materials configured. Click &apos;Add New&apos; to start.
                    </ThemedText>
                  )}
                </View>
              </ThemedView>
            )}

            {activeTab === 'printers' && (
              <ThemedView type="surface" style={styles.card}>
                <View style={[styles.cardHeaderRow, { borderBottomColor: theme.outline }]}>
                  <ThemedText type="smallBold" style={styles.cardHeaderNoMargin}>Printers</ThemedText>
                  <Button mode="outlined" onPress={addPrinter} icon="plus">
                    Add New
                  </Button>
                </View>
                
                <View style={styles.listContainer}>
                  {printers.map((printer) => (
                    <View key={printer.id} style={styles.dynamicRow}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Printer Name</ThemedText>
                        <PaperTextInput
                          mode="outlined"
                          dense
                          style={{ backgroundColor: theme.background }}
                          placeholder="e.g. Roland 1"
                          value={printer.name}
                          onChangeText={(text) => updatePrinter(printer.id, text)}
                        />
                      </View>
                      <View style={{ paddingTop: 24 }}>
                        <Pressable onPress={() => removePrinter(printer.id)} style={[styles.deleteButton, { backgroundColor: (theme.error || '#FF3B30') + '1A' }]}>
                          <SymbolView name={{ ios: 'trash.fill', android: 'delete', web: 'delete' }} size={18} tintColor={theme.error || '#FF3B30'} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  {printers.length === 0 && (
                    <ThemedText type="small" themeColor="onSurfaceVariant" style={{ textAlign: 'center', padding: 24 }}>
                      No printers configured. Click &apos;Add New&apos; to start.
                    </ThemedText>
                  )}
                </View>
              </ThemedView>
            )}
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
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 16,
  },
  headerTextContainer: {
    flex: 1,
    minWidth: '60%',
  },
  title: {
    fontSize: 28,
    marginBottom: 4,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
  },
  tabSelector: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  tabButton: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
    flex: 1,
    alignItems: 'center',
    minWidth: '20%',
  },
  activeTabButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  card: {
    padding: 24,
    borderRadius: 16,
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  cardHeader: {
    fontSize: 18,
    borderBottomWidth: 1,
    paddingBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 16,
  },
  cardHeaderNoMargin: {
    fontSize: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontWeight: '500',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  listContainer: {
    gap: 16,
  },
  dynamicRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  deleteButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
});
