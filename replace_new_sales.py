import re
import sys

def main():
    file_path = '/Users/elijah/Documents/Dev/bomedia-sales/src/app/new-sales.tsx'
    with open(file_path, 'r') as f:
        content = f.read()

    # 1. Imports
    content = content.replace(
        "import { Checkbox, ActivityIndicator } from 'react-native-paper';",
        "import { Checkbox, ActivityIndicator, TextInput as PaperTextInput, Surface, Button, SegmentedButtons } from 'react-native-paper';"
    )
    content = content.replace(
        "import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View, KeyboardAvoidingView, Alert, Modal, Animated, PanResponder, TouchableOpacity } from 'react-native';",
        "import { Platform, Pressable, ScrollView, StyleSheet, View, KeyboardAvoidingView, Alert, Modal, Animated, PanResponder, TouchableOpacity } from 'react-native';"
    )

    # 2. Convert <ThemedView type="backgroundElement" ...> to <Surface elevation={1} ...>
    # We must match `<ThemedView type="backgroundElement"` and find its corresponding `</ThemedView>`
    # Given the structure, we can just replace the opening tags and then manually handle the closing tags or just use regex for pairs if they are not nested.
    # In `new-sales.tsx`, `ThemedView type="backgroundElement"` are used for the 3 main cards.
    # They don't contain other ThemedViews except maybe simple ones.
    # Let's replace the opening tag:
    content = content.replace(
        '<ThemedView type="backgroundElement" style={styles.card}>',
        '<Surface elevation={1} style={styles.card}>'
    )
    content = content.replace(
        '<ThemedView type="backgroundElement" style={[styles.card, { zIndex: 10 }]}>',
        '<Surface elevation={1} style={[styles.card, { zIndex: 10 }]}>'
    )
    # The closing tags for those cards:
    # Card 1 ends right before Card 2
    content = content.replace(
        '            </View>\n          </ThemedView>\n\n          {/* Section 2: Job Dimensions & Pricing */}',
        '            </View>\n          </Surface>\n\n          {/* Section 2: Job Dimensions & Pricing */}'
    )
    # Card 2 ends right before Card 3
    content = content.replace(
        '            </View>\n          </ThemedView>\n\n          {/* Section 3: Batch Summary & Advanced Payment */}',
        '            </View>\n          </Surface>\n\n          {/* Section 3: Batch Summary & Advanced Payment */}'
    )
    # Card 3 ends right before </ThemedView> and ScrollView
    content = content.replace(
        '            </ThemedView>\n          )}\n        </ThemedView>\n      </ScrollView>',
        '            </Surface>\n          )}\n        </ThemedView>\n      </ScrollView>'
    )
    
    # Wait, the third card has an inner ThemedView for summary
    # Let's check line 748 and 813. It's actually:
    # <ThemedView type="backgroundElement" style={[styles.card, { backgroundColor: theme.backgroundElement }]}> ...
    content = content.replace(
        '<ThemedView style={[styles.card, { backgroundColor: theme.backgroundElement }]}>',
        '<Surface elevation={2} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>'
    )
    # And its closing:
    content = content.replace(
        '              </View>\n            </ThemedView>\n          )}',
        '              </View>\n            </Surface>\n          )}'
    )

    # 3. Replace <TextInput ... /> with PaperTextInput
    # To do this safely, we will define block replacements for each input.
    
    # Date Input
    # Date uses a special Pressable. No TextInput.

    # Client Name
    content = content.replace(
'''              <TextInput 
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
              />''',
'''              <PaperTextInput 
                mode="outlined"
                dense
                style={{ backgroundColor: theme.background }}
                placeholder="Enter client name"
                value={clientName}
                onChangeText={setClientName}
                ref={clientNameRef}
                returnKeyType="next"
                onSubmitEditing={() => contactRef.current?.focus()}
              />'''
    )

    # Contact
    content = content.replace(
'''              <TextInput 
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
              />''',
'''              <PaperTextInput 
                mode="outlined"
                dense
                style={{ backgroundColor: theme.background }}
                placeholder="e.g. 08012345678"
                value={contact}
                onChangeText={setContact}
                ref={contactRef}
                returnKeyType="next"
                onSubmitEditing={() => jobNameRef.current?.focus()}
              />'''
    )

    # Job Name
    content = content.replace(
'''              <TextInput 
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
              />''',
'''              <PaperTextInput 
                mode="outlined"
                dense
                style={{ backgroundColor: theme.background }}
                placeholder="e.g. Birthday Banner"
                value={jobName}
                onChangeText={setJobName}
                ref={jobNameRef}
                returnKeyType="next"
                onSubmitEditing={() => materialRef.current?.focus()}
              />'''
    )

    # Dimensions
    content = content.replace(
'''                    <TextInput
                      style={[styles.input, { flex: 1, color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
                      placeholder="W"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="numeric"
                      value={width}
                      onChangeText={setWidth}
                      ref={widthRef}
                      returnKeyType="next"
                      onSubmitEditing={() => heightRef.current?.focus()}
                    />
                    <ThemedText style={{ paddingHorizontal: 4 }}>x</ThemedText>
                    <TextInput
                      style={[styles.input, { flex: 1, color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
                      placeholder="H"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="numeric"
                      value={height}
                      onChangeText={setHeight}
                      ref={heightRef}
                      returnKeyType="next"
                      onSubmitEditing={() => quantityRef.current?.focus()}
                    />''',
'''                    <PaperTextInput
                      mode="outlined"
                      dense
                      style={{ flex: 1, backgroundColor: theme.background }}
                      placeholder="W"
                      keyboardType="numeric"
                      value={width}
                      onChangeText={setWidth}
                      ref={widthRef}
                      returnKeyType="next"
                      onSubmitEditing={() => heightRef.current?.focus()}
                    />
                    <ThemedText style={{ paddingHorizontal: 4, alignSelf: 'center' }}>x</ThemedText>
                    <PaperTextInput
                      mode="outlined"
                      dense
                      style={{ flex: 1, backgroundColor: theme.background }}
                      placeholder="H"
                      keyboardType="numeric"
                      value={height}
                      onChangeText={setHeight}
                      ref={heightRef}
                      returnKeyType="next"
                      onSubmitEditing={() => quantityRef.current?.focus()}
                    />'''
    )

    # Unit Toggle
    content = content.replace(
'''                  <View style={[styles.row, { borderWidth: 1, borderColor: theme.border, borderRadius: Spacing.two, overflow: 'hidden' }]}>
                    {(['in', 'ft'] as const).map((unit) => (
                      <Pressable
                        key={unit}
                        onPress={() => setJobUnit(unit)}
                        style={[
                          styles.toggleButton,
                          { backgroundColor: jobUnit === unit ? theme.primary : theme.background }
                        ]}
                      >
                        <ThemedText type="smallBold" style={{ color: jobUnit === unit ? '#ffffff' : theme.text }}>
                          {unit.toUpperCase()}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>''',
'''                  <SegmentedButtons
                    value={jobUnit}
                    onValueChange={(val) => setJobUnit(val as 'in' | 'ft')}
                    buttons={[
                      { value: 'in', label: 'IN' },
                      { value: 'ft', label: 'FT' },
                    ]}
                    density="small"
                  />'''
    )

    # Quantity
    content = content.replace(
'''              <View style={[styles.row, { alignItems: 'center' }]}>
                <View style={[styles.row, { alignItems: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: Spacing.two, height: 44, backgroundColor: theme.background }]}>
                  <Pressable onPress={decrementQuantity} style={styles.stepperButtonInside}>
                    <ThemedText style={{ fontSize: 20, color: theme.text }}>-</ThemedText>
                  </Pressable>
                  <TextInput
                    style={{ width: 50, textAlign: 'center', color: theme.text, fontSize: 16 }}
                    keyboardType="numeric"
                    value={quantity}
                    onChangeText={setQuantity}
                    ref={quantityRef}
                    returnKeyType="next"
                    onSubmitEditing={() => unitPriceRef.current?.focus()}
                  />
                  <Pressable onPress={incrementQuantity} style={styles.stepperButtonInside}>
                    <ThemedText style={{ fontSize: 20, color: theme.text }}>+</ThemedText>
                  </Pressable>
                </View>
              </View>''',
'''              <View style={[styles.row, { alignItems: 'center' }]}>
                <View style={[styles.row, { alignItems: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: Spacing.two, height: 48, backgroundColor: theme.background }]}>
                  <Pressable onPress={decrementQuantity} style={styles.stepperButtonInside}>
                    <ThemedText style={{ fontSize: 20, color: theme.text }}>-</ThemedText>
                  </Pressable>
                  <PaperTextInput
                    mode="flat"
                    dense
                    style={{ width: 60, textAlign: 'center', backgroundColor: 'transparent' }}
                    underlineColor="transparent"
                    activeUnderlineColor="transparent"
                    keyboardType="numeric"
                    value={quantity}
                    onChangeText={setQuantity}
                    ref={quantityRef}
                    returnKeyType="next"
                    onSubmitEditing={() => unitPriceRef.current?.focus()}
                  />
                  <Pressable onPress={incrementQuantity} style={styles.stepperButtonInside}>
                    <ThemedText style={{ fontSize: 20, color: theme.text }}>+</ThemedText>
                  </Pressable>
                </View>
              </View>'''
    )

    # Unit Price
    content = content.replace(
'''              <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
                <ThemedText style={{ color: theme.textSecondary, marginRight: 8 }}>₦</ThemedText>
                <TextInput
                  style={{ flex: 1, color: theme.text, fontSize: 14 }}
                  placeholder="0.00"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="numeric"
                  value={unitPrice}
                  onChangeText={setUnitPrice}
                  ref={unitPriceRef}
                />
              </View>''',
'''              <PaperTextInput
                mode="outlined"
                dense
                style={{ backgroundColor: theme.background }}
                placeholder="0.00"
                keyboardType="numeric"
                value={unitPrice}
                onChangeText={setUnitPrice}
                ref={unitPriceRef}
                left={<PaperTextInput.Affix text="₦" />}
              />'''
    )

    # Turnaround Time Toggle
    content = content.replace(
'''              <View style={[styles.row, { borderWidth: 1, borderColor: theme.border, borderRadius: Spacing.two, overflow: 'hidden', height: 44 }]}>
                {(['Standard', 'Rush', 'Same Day'] as const).map((time) => (
                  <Pressable
                    key={time}
                    onPress={() => setTurnaroundTime(time)}
                    style={[
                      styles.toggleButton,
                      { flex: 1, height: '100%', backgroundColor: turnaroundTime === time ? theme.primary : theme.background }
                    ]}
                  >
                    <ThemedText type="smallBold" style={{ color: turnaroundTime === time ? '#ffffff' : theme.text, fontSize: 12 }}>
                      {time}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>''',
'''              <SegmentedButtons
                value={turnaroundTime}
                onValueChange={(val) => setTurnaroundTime(val as 'Standard' | 'Rush' | 'Same Day')}
                buttons={[
                  { value: 'Standard', label: 'Standard' },
                  { value: 'Rush', label: 'Rush' },
                  { value: 'Same Day', label: 'Same Day' },
                ]}
                density="small"
              />'''
    )

    # Add to Batch Button
    content = content.replace(
'''            <Pressable
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
                + Add to Batch
              </ThemedText>
            </Pressable>''',
'''            <Button
              mode="contained"
              onPress={addToBatch}
              disabled={!materialQuery || !width || !height || !unitPrice}
              style={{ marginTop: 16 }}
              contentStyle={{ height: 48 }}
            >
              Add to Batch
            </Button>'''
    )

    # Advanced Payment
    content = content.replace(
'''                <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
                  <ThemedText style={{ color: theme.textSecondary, marginRight: 8 }}>₦</ThemedText>
                  <TextInput
                    style={{ flex: 1, color: theme.text, fontSize: 14 }}
                    placeholder="0.00"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                    value={advancePayment}
                    onChangeText={setAdvancePayment}
                  />
                </View>''',
'''                <PaperTextInput
                  mode="outlined"
                  dense
                  style={{ backgroundColor: theme.background }}
                  placeholder="0.00"
                  keyboardType="numeric"
                  value={advancePayment}
                  onChangeText={setAdvancePayment}
                  left={<PaperTextInput.Affix text="₦" />}
                />'''
    )

    # Delivery Cost
    content = content.replace(
'''                <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
                  <ThemedText style={{ color: theme.textSecondary, marginRight: 8 }}>₦</ThemedText>
                  <TextInput
                    style={{ flex: 1, color: theme.text, fontSize: 14 }}
                    placeholder="0.00"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                    value={deliveryCost}
                    onChangeText={setDeliveryCost}
                  />
                </View>''',
'''                <PaperTextInput
                  mode="outlined"
                  dense
                  style={{ backgroundColor: theme.background }}
                  placeholder="0.00"
                  keyboardType="numeric"
                  value={deliveryCost}
                  onChangeText={setDeliveryCost}
                  left={<PaperTextInput.Affix text="₦" />}
                />'''
    )

    # Payment Method
    content = content.replace(
'''                  <View style={[styles.row, { borderWidth: 1, borderColor: theme.border, borderRadius: Spacing.two, overflow: 'hidden', height: 44 }]}>
                    {(['Cash', 'POS', 'Transfer'] as const).map((method) => (
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
                  </View>''',
'''                  <SegmentedButtons
                    value={paymentMethod}
                    onValueChange={(val) => setPaymentMethod(val as 'Cash' | 'POS' | 'Transfer')}
                    buttons={[
                      { value: 'Cash', label: 'Cash' },
                      { value: 'POS', label: 'POS' },
                      { value: 'Transfer', label: 'Transfer' },
                    ]}
                    density="small"
                  />'''
    )

    # Sticky Footer Final Submit Button
    content = content.replace(
'''            <Pressable
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
            </Pressable>''',
'''            <Button
              mode="contained"
              buttonColor="#0A802F"
              onPress={submitBatch}
              contentStyle={{ height: 48, paddingHorizontal: 16 }}
            >
              Record Sale
            </Button>'''
    )
    
    # Bottom Sheet Search Bar
    content = content.replace(
'''            <TextInput
              allowFontScaling={false}
              style={[styles.sheetSearchInput, { color: theme.text }]}
              placeholder="Search materials..."
              placeholderTextColor={theme.textSecondary}
              value={sheetSearchQuery}
              onChangeText={setSheetSearchQuery}
              returnKeyType="search"
            />''',
'''            <PaperTextInput
              mode="flat"
              dense
              style={{ flex: 1, backgroundColor: 'transparent' }}
              underlineColor="transparent"
              activeUnderlineColor="transparent"
              placeholder="Search materials..."
              value={sheetSearchQuery}
              onChangeText={setSheetSearchQuery}
              returnKeyType="search"
            />'''
    )

    with open(file_path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    main()
