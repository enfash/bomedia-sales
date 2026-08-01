import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/context/settings-context';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/currency';
import { effectiveAreaSqFt, lineTotal, pricingRatesFrom } from '@/utils/money';
import React, { useCallback, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Checkbox, TextInput as PaperTextInput, SegmentedButtons, Surface } from 'react-native-paper';

// No native animated driver on web — the sheet transform animates in JS there.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export interface JobDetailCardProps {
  onAddToBatch: (item: any) => void;
}

export const JobDetailCard = React.memo(({ onAddToBatch }: JobDetailCardProps) => {
  const theme = useTheme();
  const { settings, isLoading, refreshSettings } = useSettings();

  const [jobName, setJobName] = useState('');
  const [materialQuery, setMaterialQuery] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [jobUnit, setJobUnit] = useState<'in' | 'ft'>('ft');
  const [quantity, setQuantity] = useState('1');
  const [addEyelets, setAddEyelets] = useState(false);
  const [addLamination, setAddLamination] = useState(false);
  const [turnaroundTime, setTurnaroundTime] = useState<'Standard' | 'Rush' | 'Same Day'>('Standard');

  // Focus Refs
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

  // Material Bottom Sheet State
  const [showMaterialSheet, setShowMaterialSheet] = useState(false);
  const [sheetSearchQuery, setSheetSearchQuery] = useState('');
  const [sheetTranslateY] = useState(() => new Animated.Value(0));

  const [sheetPanResponder] = useState(() =>
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
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start(() => {
            setShowMaterialSheet(false);
            sheetTranslateY.setValue(0);
          });
        } else {
          // Snap back
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: USE_NATIVE_DRIVER,
            bounciness: 4,
          }).start();
        }
      },
    })
  );

  const openMaterialSheet = useCallback(() => {
    sheetTranslateY.setValue(0);
    setSheetSearchQuery('');
    setShowMaterialSheet(true);
  }, [sheetTranslateY]);

  const closeMaterialSheet = useCallback(() => {
    Animated.timing(sheetTranslateY, {
      toValue: 600,
      duration: 220,
      useNativeDriver: USE_NATIVE_DRIVER,
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

  const allMaterials = settings?.materials || [];
  const filteredMaterials = allMaterials.filter((m: any) => m.name.toLowerCase().includes(sheetSearchQuery.toLowerCase()));

  // Calculations for live preview
  const parsedQuantity = parseInt(quantity) || 1;
  const parsedUnitPrice = parseFloat(unitPrice) || 0;
  const parsedWidth = parseFloat(width) || 0;
  const parsedHeight = parseFloat(height) || 0;

  // All line arithmetic lives in utils/money.ts — see the rounding policy there.
  const rates = pricingRatesFrom(settings);
  const effectiveArea = effectiveAreaSqFt(parsedWidth, parsedHeight, jobUnit, rates.wasteFactor);

  // The Minimum Order Value is NOT applied per line any more. It is a minimum
  // on the order, added once as a labelled adjustment row by the batch total.
  const currentTotal = lineTotal(
    {
      width: parsedWidth,
      height: parsedHeight,
      jobUnit,
      quantity: parsedQuantity,
      unitPrice: parsedUnitPrice,
      lamination: addLamination,
      eyelets: addEyelets,
      turnaroundTime,
    },
    rates,
  );

  const handleAddToBatch = () => {
    if (!materialQuery || !width || !height || !unitPrice) return;
    
    onAddToBatch({
      id: Date.now().toString(),
      jobName,
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
    });

    // Reset item fields locally
    setJobName('');
    setMaterialQuery('');
    setWidth('');
    setHeight('');
    setQuantity('1');
    setUnitPrice('');
    setAddEyelets(false);
    setAddLamination(false);
    setTurnaroundTime('Standard');
  };

  return (
    <>
      <Surface elevation={1} style={[styles.card, { zIndex: 10 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.three }}>
          <ThemedText type="smallBold">2. Job Detail & Material</ThemedText>
          <Pressable onPress={refreshSettings} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ThemedText style={{ fontSize: 14 }}>🔄</ThemedText>
            <ThemedText type="small" style={{ color: theme.primary }}>Refresh</ThemedText>
          </Pressable>
        </View>
        
        <View style={styles.formGroup}>
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Job Name (Optional)</ThemedText>
          <PaperTextInput 
            mode="outlined"
            dense
            style={{ backgroundColor: theme.background }}
            placeholder="e.g. Birthday Banner"
            value={jobName}
            onChangeText={setJobName}
            ref={jobNameRef}
            returnKeyType="next"
            onSubmitEditing={() => materialRef.current?.focus()}
          />
        </View>

        <View style={styles.formGroup}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Material</ThemedText>
            {isLoading && <ActivityIndicator size={12} color={theme.primary} />}
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={openMaterialSheet}
            style={[
              styles.inputButton,
              { backgroundColor: theme.background, borderColor: theme.surfaceVariant },
            ]}
          >
            <ThemedText
              style={[
                styles.materialPickerText,
                { color: materialQuery ? theme.onSurface : theme.onSurfaceVariant },
              ]}
            >
              {materialQuery || 'Tap to select material...'}
            </ThemedText>
            <ThemedText style={{ color: theme.onSurfaceVariant, fontSize: 16 }}>▼</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.two }]}>
          <ThemedText type="smallBold" style={[styles.label, { marginBottom: 0 }]}>
            Dimensions & Quantity
          </ThemedText>
          
          <SegmentedButtons
            value={jobUnit}
            onValueChange={(val) => setJobUnit(val as 'in' | 'ft')}
            buttons={[
              { value: 'in', label: 'IN' },
              { value: 'ft', label: 'FT' },
            ]}
            density="small"
            style={{ width: 140 }}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Width ({jobUnit})</ThemedText>
            <PaperTextInput 
              mode="outlined"
              dense
              style={{ backgroundColor: theme.background }}
              placeholder={jobUnit === 'in' ? "e.g. 24" : "e.g. 2"}
              keyboardType="numeric"
              value={width}
              onChangeText={setWidth}
              ref={widthRef}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => heightRef.current?.focus()}
            />
          </View>
          <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Height ({jobUnit})</ThemedText>
            <PaperTextInput 
              mode="outlined"
              dense
              style={{ backgroundColor: theme.background }}
              placeholder={jobUnit === 'in' ? "e.g. 36" : "e.g. 3"}
              keyboardType="numeric"
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
            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Quantity</ThemedText>
            <View style={[
              styles.row, 
              styles.quantityContainer,
              { 
                backgroundColor: theme.background,
                borderColor: theme.surfaceVariant,
              }
            ]}>
              <Pressable
                onPress={decrementQuantity}
                style={({ pressed }) => [
                  styles.stepperButtonInside,
                  pressed && { backgroundColor: theme.surfaceVariant }
                ]}
              >
                <ThemedText style={{ fontSize: 18, color: theme.onSurface }}>-</ThemedText>
              </Pressable>
              <PaperTextInput 
                mode="flat"
                dense
                style={{
                  flex: 1,
                  textAlign: 'center',
                  backgroundColor: 'transparent',
                }}
                underlineColor="transparent"
                activeUnderlineColor="transparent"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                ref={quantityRef}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => unitPriceRef.current?.focus()}
              />
              <Pressable
                onPress={incrementQuantity}
                style={({ pressed }) => [
                  styles.stepperButtonInside,
                  pressed && { backgroundColor: theme.surfaceVariant }
                ]}
              >
                <ThemedText style={{ fontSize: 18, color: theme.onSurface }}>+</ThemedText>
              </Pressable>
            </View>
          </View>
          <View style={[styles.formGroup, { flex: 1, minWidth: 140 }]}>
            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Price/sqft (₦)</ThemedText>
            <PaperTextInput 
              mode="outlined"
              dense
              style={{ backgroundColor: theme.background }}
              placeholder="e.g. 25.00"
              keyboardType="numeric"
              value={unitPrice}
              onChangeText={setUnitPrice}
              ref={unitPriceRef}
              returnKeyType="done"
              onSubmitEditing={handleAddToBatch}
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
              <ThemedText style={{ color: theme.onSurface }}>
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
              <ThemedText style={{ color: theme.onSurface }}>
                Lamination (₦{settings?.laminationCost}/sqft)
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={[styles.formGroup, { marginBottom: Spacing.four }]}>
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>Turnaround Time</ThemedText>
          <SegmentedButtons
            value={turnaroundTime}
            onValueChange={(val) => setTurnaroundTime(val as 'Standard' | 'Rush' | 'Same Day')}
            buttons={[
              { value: 'Standard', label: 'Standard' },
              { value: 'Rush', label: 'Rush' },
              { value: 'Same Day', label: 'Same Day' },
            ]}
            density="small"
          />
        </View>

        {/* Live Preview */}
        <View style={[styles.previewCard, { backgroundColor: theme.surfaceVariant }]}>
          <ThemedText type="smallBold">Current Item Preview</ThemedText>
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText type="small" themeColor="onSurfaceVariant">
                {parsedQuantity}x {materialQuery || 'No Material'} ({width || '0'}x{height || '0'}{jobUnit})
                {addEyelets ? ' + Eyelets' : ''}{addLamination ? ' + Lam' : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontStyle: 'italic' }}>
                {parsedWidth > 0 && parsedHeight > 0
                  ? `${effectiveArea.toFixed(2)} sqft (inc waste) @ ₦${parsedUnitPrice}/sqft`
                  : `Flat rate @ ₦${parsedUnitPrice}`}
              </ThemedText>
              {/* The minimum-order notice used to live here, because the MOV was
                  applied per line. It is an order-level adjustment now and is
                  shown once on the batch review card instead. */}
            </View>
            <ThemedText type="smallBold" style={{ color: theme.primary, alignSelf: 'center', fontSize: 16 }}>
              {formatCurrency(currentTotal)}
            </ThemedText>
          </View>
        </View>

        <Button
          mode="contained"
          onPress={handleAddToBatch}
          disabled={!materialQuery || !width || !height || !unitPrice}
          style={{ marginTop: 16 }}
          contentStyle={{ height: 48 }}
        >
          Add to Batch
        </Button>
      </Surface>

      {/* Material Bottom Sheet */}
      <Modal
        visible={showMaterialSheet}
        transparent
        animationType="slide"
        onRequestClose={closeMaterialSheet}
      >
        <Pressable style={styles.sheetOverlay} onPress={closeMaterialSheet} />

        <Animated.View
          style={[
            styles.sheetPanel,
            { backgroundColor: theme.surface, transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          <View
            style={styles.sheetHandleArea}
            {...sheetPanResponder.panHandlers}
          >
            <View style={[styles.sheetHandle, { backgroundColor: theme.surfaceVariant }]} />
          </View>

          <ThemedText type="smallBold" style={styles.sheetTitle}>
            Select Material
          </ThemedText>

          <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            <PaperTextInput
              mode="outlined"
              dense
              placeholder="Search materials..."
              value={sheetSearchQuery}
              onChangeText={setSheetSearchQuery}
              style={{ backgroundColor: theme.background }}
              autoFocus
            />
          </View>

          <View style={{ flex: 1 }}>
            {filteredMaterials.map((m: any) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.sheetItem, { borderBottomColor: theme.surfaceVariant }]}
                onPress={() => selectMaterial(m)}
              >
                <ThemedText>{m.name}</ThemedText>
                <ThemedText style={{ color: theme.primary, fontWeight: '600' }}>
                  ₦{m.price}/sqft
                </ThemedText>
              </TouchableOpacity>
            ))}
            {filteredMaterials.length === 0 && (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <ThemedText themeColor="onSurfaceVariant">No materials found.</ThemedText>
              </View>
            )}
          </View>
        </Animated.View>
      </Modal>
    </>
  );
});

JobDetailCard.displayName = 'JobDetailCard';

const styles = StyleSheet.create({
  card: {
    borderRadius: Platform.OS === 'web' ? 16 : 0,
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  formGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  inputButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  materialPickerText: {
    flex: 1,
  },
  quantityContainer: {
    alignItems: 'center',
    paddingHorizontal: 0,
    borderWidth: 1,
    borderRadius: 8,
    gap: 0,
    height: 44,
  },
  stepperButtonInside: {
    width: 44,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    padding: Spacing.three,
    borderRadius: 8,
    gap: Spacing.two,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 600,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetHandleArea: {
    height: 40,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  sheetTitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  sheetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
});
