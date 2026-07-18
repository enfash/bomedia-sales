import React, { useState, useRef, useCallback } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View, KeyboardAvoidingView, Alert, Modal, Animated, PanResponder, TouchableOpacity } from 'react-native';
import { Checkbox, ActivityIndicator } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSettings } from '@/context/settings-context';
import { db } from '@/lib/firebase';
import { ref, set } from 'firebase/database';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function NewSalesScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { settings, isLoading, refreshSettings } = useSettings();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Material Bottom Sheet State
  const [materialQuery, setMaterialQuery] = useState('');
  const [showMaterialSheet, setShowMaterialSheet] = useState(false);
  const [sheetSearchQuery, setSheetSearchQuery] = useState('');
  const sheetTranslateY = useRef(new Animated.Value(0)).current;

  const scrollViewRef = useRef<ScrollView>(null);
  
  useFocusEffect(
    useCallback(() => {
      // Scroll to top when screen comes into focus
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: 0, animated: false });
      }
    }, [])
  );

  const sheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          sheetTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 60 || gestureState.vy > 0.8) {
          // Snap down and close
          Animated.timing(sheetTranslateY, {
            toValue: 600,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setShowMaterialSheet(false);
            sheetTranslateY.setValue(0);
          });
        } else {
          // Snap back
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    })
  ).current;

  // Form State
  const [clientName, setClientName] = useState('');
  const [contact, setContact] = useState('');
  const [jobName, setJobName] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  
  // Batch State
  const [batchItems, setBatchItems] = useState<any[]>([]);
  const [advancePayment, setAdvancePayment] = useState('');
  const [deliveryCost, setDeliveryCost] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'POS' | 'Transfer'>('Transfer');

  // Job Dimensions Unit Toggle
  const [jobUnit, setJobUnit] = useState<'in' | 'ft'>('ft');

  // Quantity State
  const [quantity, setQuantity] = useState('1');

  // Add-ons
  const [addEyelets, setAddEyelets] = useState(false);
  const [addLamination, setAddLamination] = useState(false);
  const [turnaroundTime, setTurnaroundTime] = useState<'Standard' | 'Rush' | 'Same Day'>('Standard');

  // Focus Refs
  const clientNameRef = useRef<any>(null);
  const contactRef = useRef<any>(null);
  const jobNameRef = useRef<any>(null);
  const materialRef = useRef<any>(null);
  const widthRef = useRef<any>(null);
  const heightRef = useRef<any>(null);
  const quantityRef = useRef<any>(null);
  const unitPriceRef = useRef<any>(null);

  const incrementQuantity = () => {
    const current = parseInt(quantity) || 0;
    setQuantity((current + 1).toString());
  };

  const decrementQuantity = () => {
    const current = parseInt(quantity) || 0;
    if (current > 1) {
      setQuantity((current - 1).toString());
    }
  };

  // Calculations for live preview
  const parsedQuantity = parseInt(quantity) || 1;
  const parsedUnitPrice = parseFloat(unitPrice) || 0;
  const parsedWidth = parseFloat(width) || 0;
  const parsedHeight = parseFloat(height) || 0;

  let areaSqFt = 0;
  if (jobUnit === 'ft') {
    areaSqFt = parsedWidth * parsedHeight;
  } else {
    // Convert square inches to square feet: (W * H) / 144
    areaSqFt = (parsedWidth * parsedHeight) / 144;
  }

  // Apply waste factor
  const wasteFactorMulti = 1 + (settings?.wasteFactor || 0) / 100;
  const areaWithWaste = areaSqFt * wasteFactorMulti;

  // Total = Area (sq ft) * Unit Price (per sq ft) * Quantity
  const effectiveArea = areaWithWaste > 0 ? areaWithWaste : 1;
  
  const baseCost = effectiveArea * parsedUnitPrice * parsedQuantity;
  const laminationCost = addLamination ? effectiveArea * (settings?.laminationCost || 0) * parsedQuantity : 0;
  const eyeletTotal = addEyelets ? (settings?.eyeletCost || 0) * parsedQuantity : 0;
  
  const turnaroundMulti = turnaroundTime === 'Standard' ? (settings?.turnaroundStandard || 1.0) : turnaroundTime === 'Rush' ? (settings?.turnaroundRush || 1.5) : (settings?.turnaroundSameDay || 2.0);

  const rawTotal = (baseCost + laminationCost) * turnaroundMulti + eyeletTotal;
  
  const minOrderPrice = settings?.mov || 1000;
  const currentTotal = rawTotal > 0 ? Math.max(rawTotal, minOrderPrice) : 0;
  const movApplied = rawTotal > 0 && currentTotal > rawTotal;

  const addToBatch = () => {
    if (!materialQuery || !width || !height || !unitPrice) return;
    
    setBatchItems([
      ...batchItems,
      {
        id: Date.now().toString(),
        jobName,
        clientName,
        contact,
        material: materialQuery,
        width,
        height,
        jobUnit,
        quantity: parsedQuantity,
        unitPrice: parsedUnitPrice,
        eyelets: addEyelets,
        lamination: addLamination,
        turnaroundTime,
        total: currentTotal,
      }
    ]);

    // Reset item fields
    setJobName('');
    setMaterialQuery('');
    setWidth('');
    setHeight('');
    setQuantity('1');
    setUnitPrice('');
  };

  const removeBatchItem = (id: string) => {
    setBatchItems(batchItems.filter(item => item.id !== id));
  };
  
  const allMaterials = settings?.materials || [];
  const filteredMaterials = allMaterials.filter(m => m.name.toLowerCase().includes(sheetSearchQuery.toLowerCase()));

  const openMaterialSheet = useCallback(() => {
    sheetTranslateY.setValue(0);
    setSheetSearchQuery('');
    setShowMaterialSheet(true);
  }, [sheetTranslateY]);

  const closeMaterialSheet = useCallback(() => {
    Animated.timing(sheetTranslateY, {
      toValue: 600,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setShowMaterialSheet(false);
      sheetTranslateY.setValue(0);
    });
  }, [sheetTranslateY]);

  const selectMaterial = useCallback((m: { id: string; name: string; price: number }) => {
    setMaterialQuery(m.name);
    if (m.price > 0) setUnitPrice(m.price.toString());
    closeMaterialSheet();
  }, [closeMaterialSheet]);

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    },
    web: {
      paddingTop: Spacing.six,
    },
  });

  const generateReceiptId = () => {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `INV-${yy}${mm}${dd}-${randomChars}`;
  };

  const submitBatch = async () => {
    if (!clientName.trim() || batchItems.length === 0) {
      alert("Please enter a client name and add at least one item.");
      return;
    }
    
    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      
      const receiptId = generateReceiptId();
      
      const subtotal = batchItems.reduce((sum, item) => sum + item.total, 0);
      const delCost = parseFloat(deliveryCost) || 0;
      const invoiceTotal = Math.max(subtotal, settings.mov) + delCost;
      const totalPaid = parseFloat(advancePayment) || 0;

      const batchRecord = {
        receiptId,
        clientName,
        contact,
        createdAt: new Date().toISOString(),
        totalAmount: invoiceTotal,
        deliveryCost: delCost,
        totalPaid: totalPaid,
        paymentMethod: paymentMethod,
        status: totalPaid >= invoiceTotal ? 'Paid' : (totalPaid > 0 ? 'Partially Paid' : 'Pending'),
        items: {} as any
      };

      batchItems.forEach((item, index) => {
        const itemId = `item_${index}`;
        batchRecord.items[itemId] = {
          ...item
        };
      });

      // Updated path structure: sales/YYYY/MM/DD/receiptId
      await set(ref(db, `sales/${yyyy}/${mm}/${dd}/${receiptId}`), batchRecord);
      
      Alert.alert('Success', `Batch submitted successfully!\nReceipt: ${receiptId}`);
      setBatchItems([]);
      setClientName('');
      setContact('');
      setAdvancePayment('');
      setDeliveryCost('');
    } catch (error) {
      console.error('Error submitting batch:', error);
      Alert.alert('Error', 'Failed to submit batch. Check your connection or Firebase config.');
    }
  };

  const batchSubtotal = batchItems.reduce((sum, item) => sum + item.total, 0);
  const finalBatchTotal = batchItems.length > 0 ? Math.max(batchSubtotal, settings?.mov || 1000) + (parseFloat(deliveryCost) || 0) : 0;

  return (
    <>
      <KeyboardAvoidingView 
        style={{ flex: 1, backgroundColor: theme.background }} 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
        ref={scrollViewRef}
        style={[styles.scrollView, { backgroundColor: theme.background }]}
        contentContainerStyle={[styles.contentContainer, contentPlatformStyle, { paddingBottom: 150 }]} // padding to avoid sticky footer overlap
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView style={styles.container}>
          {/* Header */}
          <ThemedView style={styles.header}>
            <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
              <View>
                <ThemedText type="subtitle" style={styles.title}>New Sales Record</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.subtitle}>
                  Enter details for a new sale.
                </ThemedText>
              </View>
            </View>
          </ThemedView>

          {/* Section 1: Client Information */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" style={styles.cardHeader}>1. Client Information</ThemedText>

            <View style={styles.formGroup}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Date</ThemedText>
              {Platform.OS === 'ios' ? (
                <View style={{ height: 44, justifyContent: 'center', alignItems: 'flex-start' }}>
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display="default"
                    onChange={(event, selectedDate) => {
                      if (selectedDate) setDate(selectedDate);
                    }}
                  />
                </View>
              ) : (
                <>
                  <Pressable 
                    onPress={() => setShowDatePicker(true)}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.backgroundSelected,
                        justifyContent: 'center'
                      }
                    ]}
                  >
                    <ThemedText style={{ color: theme.text }}>
                      {date.toISOString().split('T')[0]}
                    </ThemedText>
                  </Pressable>
                  {showDatePicker && Platform.OS !== 'web' && (
                    <DateTimePicker
                      value={date}
                      mode="date"
                      display="default"
                      onChange={(event, selectedDate) => {
                        setShowDatePicker(false);
                        if (selectedDate) setDate(selectedDate);
                      }}
                    />
                  )}
                </>
              )}
            </View>

            <View style={styles.formGroup}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Client / Company Name</ThemedText>
              <TextInput 
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.background,
                    borderColor: theme.backgroundSelected,
                  }
                ]}
                placeholder="Enter client name"
                placeholderTextColor={theme.textSecondary}
                value={clientName}
                onChangeText={setClientName}
                ref={clientNameRef}
                returnKeyType="next"
                onSubmitEditing={() => contactRef.current?.focus()}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Contact (Phone / Email)</ThemedText>
              <TextInput 
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.background,
                    borderColor: theme.backgroundSelected,
                  }
                ]}
                placeholder="e.g. 08012345678"
                placeholderTextColor={theme.textSecondary}
                value={contact}
                onChangeText={setContact}
                ref={contactRef}
                returnKeyType="next"
                onSubmitEditing={() => jobNameRef.current?.focus()}
              />
            </View>
          </ThemedView>

          {/* Section 2: Job Dimensions & Pricing */}
          <ThemedView type="backgroundElement" style={[styles.card, { zIndex: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <ThemedText type="smallBold" style={styles.cardHeader}>2. Job Detail & Material</ThemedText>
              <Pressable onPress={refreshSettings} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <ThemedText style={{ fontSize: 14 }}>🔄</ThemedText>
                <ThemedText type="small" style={{ color: theme.primary }}>Refresh Materials</ThemedText>
              </Pressable>
            </View>
            
            <View style={styles.formGroup}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Job Name (Optional)</ThemedText>
              <TextInput 
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.background,
                    borderColor: theme.backgroundSelected,
                  }
                ]}
                placeholder="e.g. Birthday Banner"
                placeholderTextColor={theme.textSecondary}
                value={jobName}
                onChangeText={setJobName}
                ref={jobNameRef}
                returnKeyType="next"
                onSubmitEditing={() => materialRef.current?.focus()}
              />
            </View>

            <View style={styles.formGroup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Material</ThemedText>
                {isLoading && <ActivityIndicator size={12} color={theme.primary} />}
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={openMaterialSheet}
                style={[
                  styles.input,
                  styles.materialPickerButton,
                  { backgroundColor: theme.background, borderColor: theme.backgroundSelected },
                ]}
              >
                <ThemedText
                  style={[
                    styles.materialPickerText,
                    { color: materialQuery ? theme.text : theme.textSecondary },
                  ]}
                >
                  {materialQuery || 'Tap to select material...'}
                </ThemedText>
                <ThemedText style={{ color: theme.textSecondary, fontSize: 16 }}>▼</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.two }]}>
              <ThemedText type="smallBold" style={[styles.cardHeader, { marginBottom: 0 }]}>
                Dimensions & Quantity
              </ThemedText>
              
              <View style={[styles.row, { gap: 0, borderRadius: Spacing.two, overflow: 'hidden', borderWidth: 1, borderColor: theme.backgroundSelected }]}>
                <Pressable
                  onPress={() => setJobUnit('in')}
                  style={[
                    styles.toggleButton,
                    { backgroundColor: jobUnit === 'in' ? theme.primary : theme.background }
                  ]}
                >
                  <ThemedText type="smallBold" style={{ color: jobUnit === 'in' ? '#ffffff' : theme.text }}>
                    in
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setJobUnit('ft')}
                  style={[
                    styles.toggleButton,
                    { backgroundColor: jobUnit === 'ft' ? theme.primary : theme.background }
                  ]}
                >
                  <ThemedText type="smallBold" style={{ color: jobUnit === 'ft' ? '#ffffff' : theme.text }}>
                    ft
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Width ({jobUnit})</ThemedText>
                <TextInput 
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      backgroundColor: theme.background,
                      borderColor: theme.backgroundSelected,
                    }
                  ]}
                  placeholder={jobUnit === 'in' ? "e.g. 24" : "e.g. 2"}
                  keyboardType="numeric"
                  placeholderTextColor={theme.textSecondary}
                  value={width}
                  onChangeText={setWidth}
                  ref={widthRef}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => heightRef.current?.focus()}
                />
              </View>
              <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Height ({jobUnit})</ThemedText>
                <TextInput 
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      backgroundColor: theme.background,
                      borderColor: theme.backgroundSelected,
                    }
                  ]}
                  placeholder={jobUnit === 'in' ? "e.g. 36" : "e.g. 3"}
                  keyboardType="numeric"
                  placeholderTextColor={theme.textSecondary}
                  value={height}
                  onChangeText={setHeight}
                  ref={heightRef}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => quantityRef.current?.focus()}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Quantity</ThemedText>
                <View style={[
                  styles.row, 
                  styles.input,
                  { 
                    alignItems: 'center', 
                    paddingHorizontal: 0,
                    backgroundColor: theme.background,
                    borderColor: theme.backgroundSelected,
                    gap: 0,
                  }
                ]}>
                  <Pressable
                    onPress={decrementQuantity}
                    style={({ pressed }) => [
                      styles.stepperButtonInside,
                      pressed && styles.pressed
                    ]}
                  >
                    <ThemedText style={{ fontSize: 18, color: theme.text }}>-</ThemedText>
                  </Pressable>
                  <TextInput 
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      color: theme.text,
                      fontSize: 14,
                      height: '100%',
                    }}
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="numeric"
                    placeholderTextColor={theme.textSecondary}
                    ref={quantityRef}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => unitPriceRef.current?.focus()}
                  />
                  <Pressable
                    onPress={incrementQuantity}
                    style={({ pressed }) => [
                      styles.stepperButtonInside,
                      pressed && styles.pressed
                    ]}
                  >
                    <ThemedText style={{ fontSize: 18, color: theme.text }}>+</ThemedText>
                  </Pressable>
                </View>
              </View>
              <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Price/sqft (₦)</ThemedText>
                <TextInput 
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      backgroundColor: theme.background,
                      borderColor: theme.backgroundSelected,
                    }
                  ]}
                  placeholder="e.g. 25.00"
                  keyboardType="numeric"
                  placeholderTextColor={theme.textSecondary}
                  value={unitPrice}
                  onChangeText={setUnitPrice}
                  ref={unitPriceRef}
                  returnKeyType="done"
                  onSubmitEditing={addToBatch}
                />
              </View>
            </View>

            <View style={[styles.row, { alignItems: 'center', marginBottom: Spacing.four, gap: Spacing.two, flexWrap: 'wrap' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: Spacing.two }}>
                <Checkbox
                  status={addEyelets ? 'checked' : 'unchecked'}
                  onPress={() => setAddEyelets(!addEyelets)}
                  color={theme.primary}
                />
                <Pressable onPress={() => setAddEyelets(!addEyelets)}>
                  <ThemedText style={{ color: theme.text }}>
                    Eyelets ({settings?.eyeletCost === 0 ? 'Free' : `₦${settings?.eyeletCost}`})
                  </ThemedText>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Checkbox
                  status={addLamination ? 'checked' : 'unchecked'}
                  onPress={() => setAddLamination(!addLamination)}
                  color={theme.primary}
                />
                <Pressable onPress={() => setAddLamination(!addLamination)}>
                  <ThemedText style={{ color: theme.text }}>
                    Lamination (₦{settings?.laminationCost}/sqft)
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            <View style={[styles.formGroup, { marginBottom: Spacing.four }]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Turnaround Time</ThemedText>
              <View style={[styles.row, { gap: 0, borderRadius: Spacing.two, overflow: 'hidden', borderWidth: 1, borderColor: theme.backgroundSelected }]}>
                {['Standard', 'Rush', 'Same Day'].map((time) => (
                  <Pressable
                    key={time}
                    onPress={() => setTurnaroundTime(time as 'Standard' | 'Rush' | 'Same Day')}
                    style={[
                      styles.toggleButton,
                      { flex: 1, backgroundColor: turnaroundTime === time ? theme.primary : theme.background }
                    ]}
                  >
                    <ThemedText type="smallBold" style={{ color: turnaroundTime === time ? '#ffffff' : theme.text }}>
                      {time}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Live Preview */}
            <View style={[styles.previewCard, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold">Current Item Preview</ThemedText>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {parsedQuantity}x {materialQuery || 'No Material'} ({width || '0'}x{height || '0'}{jobUnit})
                    {addEyelets ? ' + Eyelets' : ''}{addLamination ? ' + Lam' : ''}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontStyle: 'italic' }}>
                    {areaSqFt > 0 ? `${areaWithWaste.toFixed(2)} sqft (inc waste) @ ₦${parsedUnitPrice}/sqft` : `Flat rate @ ₦${parsedUnitPrice}`}
                  </ThemedText>
                  {movApplied && (
                    <ThemedText type="smallBold" style={{ color: '#F59E0B' }}>
                      * Minimum order price of ₦{minOrderPrice} applied
                    </ThemedText>
                  )}
                </View>
                <ThemedText type="smallBold" style={{ color: theme.primary, alignSelf: 'center', fontSize: 16 }}>
                  ₦{currentTotal.toLocaleString()}
                </ThemedText>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.submitButton, 
                { backgroundColor: theme.primary },
                pressed && styles.pressed,
                (!materialQuery || !width || !height || !unitPrice) && { opacity: 0.5 }
              ]}
              onPress={addToBatch}
              disabled={!materialQuery || !width || !height || !unitPrice}
            >
              <ThemedText type="smallBold" style={styles.submitButtonText}>
                Add to Batch
              </ThemedText>
            </Pressable>
          </ThemedView>

          {/* Section 4: Batch Review */}
          {batchItems.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <ThemedText type="defaultSemiBold">Items in Order ({batchItems.length})</ThemedText>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  Items Subtotal: ₦{Math.max(batchItems.reduce((sum, item) => sum + item.total, 0), settings.mov).toLocaleString()}
                </ThemedText>
              </View>

              <View style={{ gap: Spacing.three }}>
                {batchItems.map((item, index) => {
                  const w = parseFloat(item.width) || 0;
                  const h = parseFloat(item.height) || 0;
                  const area = item.jobUnit === 'ft' ? (w * h) : ((w * h) / 144);
                  const effArea = area > 0 ? area : 1;

                  return (
                    <View key={item.id} style={[styles.batchItem, { borderColor: theme.backgroundSelected }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <ThemedText type="smallBold">Item {index + 1}: {item.jobName || 'Unnamed'} ({item.material})</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {item.quantity}x ({item.width}x{item.height}{item.jobUnit})
                          {item.eyelets ? ' + Eyelets' : ''}{item.lamination ? ' + Lam' : ''} {item.turnaroundTime !== 'Standard' ? `(${item.turnaroundTime})` : ''}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" style={{ fontStyle: 'italic' }}>
                          {effArea > 0 ? `${(effArea * (1 + (settings?.wasteFactor || 0) / 100)).toFixed(2)} sqft (inc waste) @ ₦${item.unitPrice.toLocaleString()}/sqft` : `₦${item.unitPrice.toLocaleString()}`}
                        </ThemedText>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: Spacing.one, justifyContent: 'center' }}>
                        <ThemedText type="smallBold" style={{ color: theme.primary }}>
                          ₦{item.total.toLocaleString()}
                        </ThemedText>
                        <Pressable onPress={() => removeBatchItem(item.id)}>
                          <ThemedText type="smallBold" style={{ color: '#EF4444' }}>Remove</ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={[styles.formGroup, { marginTop: Spacing.four }]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Delivery / Dispatch Cost (₦)</ThemedText>
                <TextInput 
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      backgroundColor: theme.background,
                      borderColor: theme.backgroundSelected,
                    }
                  ]}
                  placeholder="e.g. 2000 (0 for pickup)"
                  keyboardType="numeric"
                  placeholderTextColor={theme.textSecondary}
                  value={deliveryCost}
                  onChangeText={setDeliveryCost}
                />
              </View>

              <View style={[styles.row, { marginTop: Spacing.two }]}>
                <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Advance / Paid Amount (₦)</ThemedText>
                  <TextInput 
                    style={[
                      styles.input,
                      {
                        color: theme.text,
                        backgroundColor: theme.background,
                        borderColor: theme.backgroundSelected,
                      }
                    ]}
                    placeholder="e.g. 5000"
                    keyboardType="numeric"
                    placeholderTextColor={theme.textSecondary}
                    value={advancePayment}
                    onChangeText={setAdvancePayment}
                  />
                </View>
                
                <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Payment Method</ThemedText>
                  <View style={[styles.row, { gap: 0, borderRadius: Spacing.two, overflow: 'hidden', borderWidth: 1, borderColor: theme.backgroundSelected, height: 44 }]}>
                    {['Cash', 'POS', 'Transfer'].map((method) => (
                      <Pressable
                        key={method}
                        onPress={() => setPaymentMethod(method as any)}
                        style={[
                          styles.toggleButton,
                          { flex: 1, height: '100%', backgroundColor: paymentMethod === method ? theme.primary : theme.background }
                        ]}
                      >
                        <ThemedText type="smallBold" style={{ color: paymentMethod === method ? '#ffffff' : theme.text, fontSize: 11 }}>
                          {method}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            </ThemedView>
          )}
        </ThemedView>
      </ScrollView>

      {/* Sticky Bottom Footer for Checkout */}
      {batchItems.length > 0 && (
        <View style={[
          styles.stickyFooter, 
          { 
            backgroundColor: theme.backgroundElement,
            borderTopColor: theme.backgroundSelected,
            paddingBottom: Platform.OS === 'ios' ? insets.bottom : Spacing.four,
          }
        ]}>
          <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' }]}>
            <View>
              <ThemedText type="small" themeColor="textSecondary">Final Total</ThemedText>
              <ThemedText type="subtitle" style={{ color: theme.primary, fontWeight: '700' }}>
                ₦{finalBatchTotal.toLocaleString()}
              </ThemedText>
            </View>
            
            <Pressable
              style={({ pressed }) => [
                styles.submitButton, 
                { backgroundColor: '#0A802F', marginTop: 0, paddingHorizontal: Spacing.six },
                pressed && styles.pressed,
              ]}
              onPress={submitBatch}
            >
              <ThemedText type="smallBold" style={styles.submitButtonText}>
                Record Sale
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}
      </KeyboardAvoidingView>

      {/* ── Material Bottom Sheet ── */}
      <Modal
        visible={showMaterialSheet}
        transparent
        animationType="slide"
        onRequestClose={closeMaterialSheet}
      >
        {/* Dim overlay — tap to dismiss */}
        <Pressable style={styles.sheetOverlay} onPress={closeMaterialSheet} />

        {/* Sheet panel */}
        <Animated.View
          style={[
            styles.sheetPanel,
            { backgroundColor: theme.backgroundElement, transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          {/* Drag handle — tall hit area with PanResponder */}
          <View
            style={styles.sheetHandleArea}
            {...sheetPanResponder.panHandlers}
          >
            <View style={[styles.sheetHandle, { backgroundColor: theme.backgroundSelected }]} />
          </View>

          <ThemedText type="smallBold" style={styles.sheetTitle}>
            Select Material
          </ThemedText>

          {/* Search bar */}
          <View style={[styles.sheetSearchBar, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
            <ThemedText style={{ fontSize: 16, color: theme.textSecondary }}>🔍</ThemedText>
            <TextInput
              allowFontScaling={false}
              style={[styles.sheetSearchInput, { color: theme.text }]}
              placeholder="Search materials..."
              placeholderTextColor={theme.textSecondary}
              value={sheetSearchQuery}
              onChangeText={setSheetSearchQuery}
              returnKeyType="search"
            />
            {sheetSearchQuery.length > 0 && (
              <Pressable onPress={() => setSheetSearchQuery('')}>
                <ThemedText style={{ fontSize: 16, color: theme.textSecondary }}>✕</ThemedText>
              </Pressable>
            )}
          </View>

          {/* Material list */}
          <ScrollView
            style={styles.sheetList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {filteredMaterials.length === 0 ? (
              <View style={styles.sheetEmpty}>
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  {allMaterials.length === 0
                    ? 'No materials configured.\nGo to Settings → Materials to add some.'
                    : 'No materials match your search.'}
                </ThemedText>
              </View>
            ) : (
              filteredMaterials.map((m) => (
                <Pressable
                  key={m.id}
                  style={({ pressed }) => [
                    styles.sheetItem,
                    {
                      backgroundColor: pressed ? theme.backgroundSelected : theme.background,
                      borderWidth: materialQuery === m.name ? 2 : 1,
                      borderColor: materialQuery === m.name ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => selectMaterial(m)}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold">{m.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      ₦{m.price.toLocaleString()} / sqft
                    </ThemedText>
                  </View>
                  {materialQuery === m.name && (
                    <ThemedText style={{ color: theme.primary, fontSize: 18 }}>✓</ThemedText>
                  )}
                </Pressable>
              ))
            )}
            {/* bottom padding so last item isn't hidden behind safe area */}
            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
  submitButton: {
    height: 48,
    borderRadius: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.8,
  },
  toggleButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonInside: {
    height: '100%',
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  materialPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  materialPickerText: {
    flex: 1,
    fontSize: 15,
  },
  previewCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    marginTop: Spacing.two,
    gap: Spacing.one,
  },
  batchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    padding: Spacing.four,
    elevation: 10,
    boxShadow: '0px -4px 10px rgba(0,0,0,0.05)',
  },
  // ── Bottom Sheet ──
  sheetOverlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    maxHeight: '75%',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
  },
  sheetHandleArea: {
    width: '100%',
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 18,
    marginBottom: Spacing.three,
  },
  sheetSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    gap: Spacing.two,
    height: 48,
    marginBottom: Spacing.three,
  },
  sheetSearchInput: {
    flex: 1,
    fontSize: 15,
    height: '100%',
  },
  sheetList: {
    flexGrow: 0,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    borderWidth: 1,
  },
  sheetEmpty: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
});
