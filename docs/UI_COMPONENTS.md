# UI Components

This document outlines the core reusable components built for the project. Every component is designed to conform to the brand guidelines and utilize Material Design 3 via React Native Paper.

---

## PrimaryButton

- **Documentation:** Primary action button. Wraps React Native Paper's Button with `mode="contained"`.
- **Props:** Inherits all standard Paper `ButtonProps` except `mode`.
- **Usage Example:**
  ```tsx
  <PrimaryButton onPress={handleSave} loading={isSaving}>
    Save Record
  </PrimaryButton>
  ```
- **Supported Variants:** Contained only.
- **Accessibility Notes:** 
  - Standard button role.
  - High contrast background using `theme.colors.primary`.
  - Respects standard minimum touch target size.

---

## SecondaryButton

- **Documentation:** Secondary action button for alternate actions. Wraps React Native Paper's Button.
- **Props:** Inherits Paper `ButtonProps`, with restricted modes (`'outlined' | 'text'`).
- **Usage Example:**
  ```tsx
  <SecondaryButton mode="text" onPress={handleCancel}>
    Cancel
  </SecondaryButton>
  ```
- **Supported Variants:** `'outlined'` (default), `'text'`.
- **Accessibility Notes:** 
  - Standard button role.
  - Outlined or transparent background, lower visual priority than `PrimaryButton`.

---

## IconButton

- **Documentation:** Themed icon button wrapper around React Native Paper's `IconButton`.
- **Props:** Inherits standard Paper `IconButtonProps`.
- **Usage Example:**
  ```tsx
  <IconButton icon="camera" size={24} onPress={() => {}} />
  ```
- **Supported Variants:** Standard Paper variants.
- **Accessibility Notes:** 
  - Always provide an `accessibilityLabel` when using an icon without visible text.
  - Ensures 48x48 touch target area.

---

## StatusChip

- **Documentation:** A visual indicator for transaction or record status.
- **Props:** `status: string`, `style?: StyleProp<ViewStyle>`
- **Usage Example:**
  ```tsx
  <StatusChip status="Paid" />
  ```
- **Supported Variants:** Paid (Green), Part Paid (Orange), Outstanding (Red), Cancelled (Grey).
- **Accessibility Notes:** 
  - Ensure the context around the chip communicates the status to screen readers, as chips are visual supplements.
  - Uses compliant contrast ratios for background/text pairs.

---

## SearchBar

- **Documentation:** Customized SearchBar using React Native Paper's Searchbar with standard elevation and height.
- **Props:** Inherits Paper `SearchbarProps`.
- **Usage Example:**
  ```tsx
  <SearchBar placeholder="Search records..." onChangeText={setQuery} value={query} />
  ```
- **Supported Variants:** Bar (default).
- **Accessibility Notes:** 
  - Includes standard search input accessibility roles.
  - Minimum height of 48dp for easy tapping.

---

## FilterBar

- **Documentation:** Horizontal scrollable filter bar with selectable chips.
- **Props:** `options: FilterOption[]`, `selectedValue?: string`, `onSelect: (value: string) => void`, `style?: any`
- **Usage Example:**
  ```tsx
  <FilterBar 
    options={[{ label: 'All', value: 'all' }, { label: 'Paid', value: 'paid' }]} 
    selectedValue={filter} 
    onSelect={setFilter} 
  />
  ```
- **Supported Variants:** N/A.
- **Accessibility Notes:** 
  - Uses horizontal scroll; ensure items are reachable via keyboard/screen reader swipe.
  - Active state is communicated visually and through `selected` prop.

---

## KPICard

- **Documentation:** A summary card displaying a key performance indicator (KPI) with an icon.
- **Props:** `title: string`, `value: string`, `iconName: any`, `iconColor?: string`, `iconBackgroundColor?: string`, `style?: StyleProp<ViewStyle>`
- **Usage Example:**
  ```tsx
  <KPICard 
    title="Total Revenue" 
    value="$12,000" 
    iconName="dollarsign.circle" 
    iconColor="#FFF" 
    iconBackgroundColor="#2E388D" 
  />
  ```
- **Supported Variants:** Elevated Surface.
- **Accessibility Notes:** 
  - Ensure icon color contrasts well against iconBackgroundColor.
  - Reads as a single data point summary.

---

## TransactionCard

- **Documentation:** Standardized card for displaying transaction or sales records. Employs Progressive Disclosure.
- **Props:** `customerName: string`, `status: string`, `date: string`, `total: string`, `itemCount: number`, `style?: StyleProp<ViewStyle>`, `onPress?: () => void`
- **Usage Example:**
  ```tsx
  <TransactionCard 
    customerName="Acme Corp" 
    status="Paid" 
    date="2023-10-01" 
    total="$1,500.00" 
    itemCount={3} 
  />
  ```
- **Supported Variants:** Elevated Surface (1dp).
- **Accessibility Notes:** 
  - Groups related transaction data together.
  - Status chip adds visual context.

---

## CustomerCard

- **Documentation:** Standardized card for displaying customer overview.
- **Props:** `name: string`, `email: string`, `initials: string`, `avatarUrl?: string`, `style?: StyleProp<ViewStyle>`, `onPress?: () => void`
- **Usage Example:**
  ```tsx
  <CustomerCard 
    name="Jane Doe" 
    email="jane@example.com" 
    initials="JD" 
  />
  ```
- **Supported Variants:** Elevated Surface (1dp).
- **Accessibility Notes:** 
  - Avatar acts as a visual complement to the textual name.
  - Entire card can be made actionable via onPress.

---

## EmptyState

- **Documentation:** Standard view for displaying empty datasets or missing content.
- **Props:** `iconName?: string`, `title: string`, `message?: string`, `actionLabel?: string`, `onAction?: () => void`, `style?: StyleProp<ViewStyle>`
- **Usage Example:**
  ```tsx
  <EmptyState 
    title="No Customers Found" 
    message="Try adjusting your filters or adding a new customer." 
    actionLabel="Add Customer" 
    onAction={() => router.push('/new-customer')}
  />
  ```
- **Supported Variants:** Centered layout with optional action button.
- **Accessibility Notes:** 
  - Communicates the absence of data clearly before prompting action.

---

## LoadingSkeleton

- **Documentation:** Placeholder component that leverages an animated fading loop to simulate loading content.
- **Props:** `style?: StyleProp<ViewStyle>`, `width?: number | string`, `height?: number | string`, `borderRadius?: number`
- **Usage Example:**
  ```tsx
  <LoadingSkeleton width="100%" height={24} />
  ```
- **Supported Variants:** Looping opacity animation.
- **Accessibility Notes:** 
  - Skeletons represent content that is loading; consider combining with `aria-busy` or `accessibilityState={{ busy: true }}` on the parent container.

---

## ErrorState

- **Documentation:** Component to catch and display errors gracefully with a retry action.
- **Props:** `title?: string`, `message: string`, `onRetry?: () => void`, `style?: StyleProp<ViewStyle>`
- **Usage Example:**
  ```tsx
  <ErrorState 
    message="Failed to load records. Please check your connection." 
    onRetry={fetchRecords} 
  />
  ```
- **Supported Variants:** Centered layout, utilizes `theme.colors.error` for emphasis.
- **Accessibility Notes:** 
  - Visually warns the user of a failure and provides a clear recovery path.

---

## BottomActionBar

- **Documentation:** Fixed bottom bar for primary actions on a screen.
- **Props:** `children: React.ReactNode`, `style?: StyleProp<ViewStyle>`
- **Usage Example:**
  ```tsx
  <BottomActionBar>
    <PrimaryButton onPress={save}>Save</PrimaryButton>
  </BottomActionBar>
  ```
- **Supported Variants:** Elevated Surface (pinned to bottom).
- **Accessibility Notes:** 
  - Ensures actions are always reachable. Includes SafeAreaView handling for devices with bottom notches/home indicators.

---

## ConfirmDialog

- **Documentation:** Standardized confirmation dialog for critical or destructive actions.
- **Props:** `visible: boolean`, `title: string`, `message: string`, `confirmLabel?: string`, `cancelLabel?: string`, `onConfirm: () => void`, `onCancel: () => void`, `isDestructive?: boolean`, `isLoading?: boolean`, `confirmButtonColor?: string`
- **Usage Example:**
  ```tsx
  <ConfirmDialog 
    visible={isDialogVisible} 
    title="Delete Record" 
    message="Are you sure you want to delete this record?" 
    onConfirm={handleDelete} 
    onCancel={() => setDialogVisible(false)} 
  />
  ```
- **Supported Variants:** Dialog Modal.
- **Accessibility Notes:** 
  - Leverages React Native Paper's Portal and Dialog for native modal accessibility.
  - Traps focus while visible.

---

## BottomSheet

- **Documentation:** A bottom-anchored modal for displaying temporary content or forms.
- **Props:** `visible: boolean`, `onDismiss: () => void`, `children: React.ReactNode`, `style?: StyleProp<ViewStyle>`, `contentStyle?: StyleProp<ViewStyle>`
- **Usage Example:**
  ```tsx
  <BottomSheet visible={showSheet} onDismiss={() => setShowSheet(false)}>
    <Text>Sheet Content</Text>
  </BottomSheet>
  ```
- **Supported Variants:** Bottom-anchored Modal.
- **Accessibility Notes:** 
  - Uses React Native Paper's Modal.
  - Background overlay provides click-to-dismiss functionality.

---

## ThemedTextInput

- **Documentation:** Wrapper around React Native Paper's TextInput providing standard styling and error messaging.
- **Props:** Inherits Paper `TextInputProps` + `errorText?: string`.
- **Usage Example:**
  ```tsx
  <ThemedTextInput 
    label="Email" 
    value={email} 
    onChangeText={setEmail} 
    errorText={emailError} 
  />
  ```
- **Supported Variants:** Outlined (default).
- **Accessibility Notes:** 
  - Associates error text with the input visually and semantically (using standard Paper implementation).

---

## ExpenseCard

- **Documentation:** Standardized card for displaying an expense record.
- **Props:** `description: string`, `category: string`, `date: string`, `amount: number`, `onPress?: () => void`, `style?: StyleProp<ViewStyle>`
- **Usage Example:**
  ```tsx
  <ExpenseCard 
    description="Office Supplies" 
    category="Equipment" 
    date="2023-10-01" 
    amount={250.00} 
  />
  ```
- **Supported Variants:** Elevated Surface (1dp).
- **Accessibility Notes:** 
  - Reads as a single expense record.
  - Formats amount correctly with standard currency formatting.

---

## DealCard

- **Documentation:** Standardized card for displaying a sales deal in a pipeline or Kanban board.
- **Props:** `company: string`, `client: string`, `value: number`, `owner: string`, `daysActive: number`, `stage?: string`, `onPress?: () => void`, `style?: StyleProp<ViewStyle>`, `compact?: boolean`
- **Usage Example:**
  ```tsx
  <DealCard 
    company="Acme Corp" 
    client="John Doe" 
    value={45000} 
    owner="Alice Smith" 
    daysActive={2}
  />
  ```
- **Supported Variants:** Elevated Surface (1dp). `compact` variant for constrained spaces like Kanban columns.
- **Accessibility Notes:** 
  - Entire card acts as a touchable button.
  - Groups related deal data for easy reading.
