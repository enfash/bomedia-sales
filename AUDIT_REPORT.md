# Comprehensive Project Audit Report

This report aggregates the findings from a complete audit of the codebase against the Material Design 3 (MD3) standard, brand guidelines, architectural rules, and performance best practices. The project currently suffers from massive form re-renders, widespread hardcoding of colours/spacing, inconsistent navigation paradigms, and a lack of reusable UI components.

## 1. Screens Audit

### Dashboard (`src/app/index.tsx`)
- **Violations:** Custom pill tabs instead of MD3 Navigation Bar, `ScrollView` instead of `FlatList`, hardcoded custom styling on charts and stat cards.
- **Why:** Fails to use standard Navigation components; memory inefficiencies with `ScrollView`.
- **Improvement:** Migrate to `<FlatList>` and use MD3 `NavigationBar` for bottom tabs. Extract chart logic to a reusable component.
- **Priority:** High
- **Effort:** Medium (4 hours)

### New Sales / Forms (`src/app/new-sales.tsx`)
- **Violations:** Massive 1,100+ line component, state defined at top-level causing full screen re-render on every keystroke, custom `PanResponder` for a bottom sheet, hardcoded MD3 elevations/shadows.
- **Why:** Violates Single Responsibility Principle and severely impacts performance. Custom BottomSheet diverges from MD3 guidelines and blocks the JS thread.
- **Improvement:** Split into smaller form sections, manage state locally or implement React Hook Form, extract the `BottomSheet` into `src/components/ui`, and use `useTheme` for shadows/elevation.
- **Priority:** High (Critical Performance Issue)
- **Effort:** Large (8 hours)

### Records, Clients & Expenses (`src/app/records.tsx`, `clients.tsx`, `expenses.tsx`)
- **Violations:** `ScrollView` with `.map()`, missing React Native Paper `DataTable`, custom chips, string concatenation for opacity (`theme.primary + '20'`), `boxShadow` instead of MD3 elevation.
- **Why:** MD3 defines strict DataTable and Chip semantics. `ScrollView` degrades list performance as the number of items grows.
- **Improvement:** Migrate to `FlatList` or `FlashList`, implement `DataTable` and standard `Chip` from react-native-paper, and fix opacity logic to be robust on all platforms.
- **Priority:** High
- **Effort:** Medium (5 hours)

### Kanban Board (`src/app/board.tsx`)
- **Violations:** Massive file (631 lines) merging logic and complex responsive layout, missing reusable cards, `ScrollView` mappings.
- **Why:** Overly complex, inefficient rendering, and difficult to maintain.
- **Improvement:** Extract `BoardColumn` and `DealCard` components.
- **Priority:** Medium
- **Effort:** Medium (4 hours)

### Invoice & Transaction (`src/app/invoice.tsx`, `src/app/transaction/[id].tsx`)
- **Violations:** Duplicate business logic (payment status), hardcoded hex values (`#fff`, `#000`), hardcoded border radii (`16`, `12` instead of relying on token standard), ad-hoc action bars.
- **Why:** Violates DRY and Brand System rules. Hardcoded colours break Dark Mode support.
- **Improvement:** Extract calculation logic to `src/lib/utils/status.ts`, use `ThemedView` and theme tokens globally.
- **Priority:** Medium
- **Effort:** Small (2 hours)

### Settings (`src/app/settings.tsx`)
- **Violations:** Huge file (600+ lines), full re-render on keystrokes, direct Firebase logic mixed with UI components.
- **Why:** Unmaintainable and sluggish performance.
- **Improvement:** Split tabs into separate component files (`ProfileTab`, `CompanyTab`, etc.) and isolate state updates.
- **Priority:** High
- **Effort:** Medium (6 hours)

### Quote Estimator (`src/app/quote.tsx`)
- **Violations:** Hardcoded custom pills and colours for duration and service selection, `rgba` backgrounds (`theme.success + '1A'`).
- **Why:** Does not align with Material Design standard choice chips or segmented buttons.
- **Improvement:** Refactor to use React Native Paper `SegmentedButtons` or standard choice chips.
- **Priority:** Low
- **Effort:** Small (2 hours)

---

## 2. Components Audit

### Missing Core Components
- **Violations:** The project completely lacks a core set of standard components (`PrimaryButton`, `SecondaryButton`, `StatusChip`, `SearchBar`, etc.) as mandated by `UI_COMPONENTS.md`. Instead, raw `Pressable` and `<Text>` are styled repetitively across screens.
- **Why:** Leads to UI inconsistencies, massive screen files, and difficult maintainability.
- **Improvement:** Implement the component library strictly using React Native Paper foundations and `useTheme()`.
- **Priority:** High
- **Effort:** Large (10 hours)

### Existing Component Inconsistencies (`app-tabs`, `desktop-sidebar`, `quota-card`, etc.)
- **Violations:** Use of non-brand colours (`#0066FF`), raw shadows instead of elevation tokens, hardcoded spacings (`8`, `12`, `16`) ignoring the `Spacing` constants.
- **Why:** Violates Brand Guidelines and MD3 specs.
- **Improvement:** Rewrite existing components to consume standard theme values and replace hardcoded padding/margin with `Spacing.three`, `Spacing.four`, etc. Add accessibility roles.
- **Priority:** High
- **Effort:** Medium (6 hours)

---

## 3. Architecture Audit

### Structure & Organization
- **Violations:** No `src/services/` or `src/api/` layer, causing deep coupling of Firebase SDK calls directly to React UI components. Application types are hidden inside random feature folders (e.g., `records/types.ts`).
- **Why:** Hinders testing, reusability, and makes swapping out data layers impossible.
- **Improvement:** Abstract data layer into custom hooks or a service folder. Centralize types into `src/types/`.
- **Priority:** Medium
- **Effort:** Medium (5 hours)

### Duplication
- **Violations:** Payment calculation logic duplicated between `use-records.ts` and `invoice.tsx`. Form UI inputs duplicated across `new-sales.tsx` and `settings.tsx`.
- **Why:** Increases likelihood of bugs when updating business rules.
- **Improvement:** Extract shared domain logic. Extract a reusable `ThemedTextInput` component.
- **Priority:** High
- **Effort:** Medium (4 hours)

---

## 4. Performance Audit

### Render Cycles
- **Violations:** Widespread lack of `useCallback`/`useMemo` in forms. Inline functions and objects force reconciliations.
- **Why:** Parent components re-rendering on keystrokes destroys reference equality, causing cascading re-renders down the tree.
- **Improvement:** Wrap event handlers in `useCallback`. Memoize heavy children components.
- **Priority:** High
- **Effort:** Medium (4 hours)

### Firebase Listeners
- **Violations:** Inefficient real-time Firebase subscriptions (`onValue` rebuilding arrays continuously on every snapshot).
- **Why:** Even minor data changes force the entire list array to be recreated, destroying app performance.
- **Improvement:** Deeply compare data before updating state, or implement selector-based state management.
- **Priority:** Medium
- **Effort:** Medium (4 hours)
