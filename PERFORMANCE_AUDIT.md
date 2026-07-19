# Performance Audit

This document outlines the performance bottlenecks in the application, ranked by expected impact. The current architecture suffers from severe render-cycle inefficiencies and poor list handling, which will cause the app to feel sluggish on mobile devices and block the JavaScript thread.

## 1. Massive Form Components Causing Full-Screen Re-renders (Critical Impact)
**Issue:** Large screens like `new-sales.tsx` (1,100+ lines) and `settings.tsx` (600+ lines) manage dozens of individual `useState` hooks for form inputs (e.g., `clientName`, `contact`, `jobName`, etc.).
**Impact:** Every single keystroke updates the state at the top level of the screen, forcing a re-render of the entire 1,100-line component. This causes severe input lag and blocks the JS thread, making typing feel unresponsive.
**Recommendation:** 
- Break down large forms into smaller, isolated components that manage their own state.
- Alternatively, use a library like `react-hook-form` to handle uncontrolled inputs and prevent unnecessary re-renders.

## 2. Lack of `FlatList` for Data Rendering (High Impact)
**Issue:** The project relies heavily on `<ScrollView>` combined with `.map()` to render lists of data across almost all screens (`board.tsx`, `clients.tsx`, `expenses.tsx`, `settings.tsx`). `FlatList` is only used inside `records-table.tsx`.
**Impact:** `ScrollView` renders all of its children at once. As the number of clients, expenses, or settings items grows, memory usage will spike and the app will freeze during initial mounts because React Native cannot lazily load or recycle views off-screen.
**Recommendation:** Replace all instances of `ScrollView` + `.map()` with `<FlatList>` or `<FlashList>` when rendering dynamic or unbounded lists.

## 3. Inline Functions & Lack of Memoisation (High Impact)
**Issue:** There is virtually no use of `useCallback` or `React.memo` throughout the application. Handlers like `onChangeText={(text) => setBusinessName(text)}` and style objects are declared inline.
**Impact:** Because the parent components re-render on every state change (see Issue #1), all inline functions and objects are recreated. This breaks reference equality for any child components, forcing the entire component tree to reconcile unnecessarily.
**Recommendation:** 
- Wrap event handlers in `useCallback`.
- Use `useMemo` for complex derived state.
- Wrap heavy UI children (like Bottom Sheets or custom tables) in `React.memo()`.

## 4. Inefficient Firebase Listeners (Medium Impact)
**Issue:** In `use-records.ts` and `settings-context.tsx`, Firebase's `onValue` realtime listeners are used to fetch data. Every time a snapshot is received, the app loops through the data, creates new arrays, and calls `setRecords(...)`.
**Impact:** Even if only one record changes, an entirely new array is generated. This forces every component consuming `useRecords()` or `useSettings()` to completely re-render. If the database updates frequently, the app will constantly freeze.
**Recommendation:** 
- Use selectors to only subscribe to necessary data slices.
- Consider switching to a server-state management library (like React Query) or deeply comparing data before updating state to avoid reference thrashing.

## 5. Navigation & Mounting Performance (Medium Impact)
**Issue:** Heavy screens are not lazily loaded, and animations (like the custom `PanResponder` Bottom Sheet in `new-sales.tsx`) run on the JS thread.
**Impact:** Transitioning between screens (e.g., tapping a tab or opening a modal) feels delayed because the JS thread is busy mounting massive, un-optimised component trees. Furthermore, standard React Native animations on the JS thread can drop frames.
**Recommendation:** 
- Offload animations to the UI thread using `react-native-reanimated`.
- Delay rendering heavy lists or complex views until after the React Navigation transition completes using `InteractionManager.runAfterInteractions()`.

---

## Summary Action Plan

If we change nothing else, the **number one priority** must be refactoring the forms in `new-sales.tsx` and `settings.tsx` to stop re-rendering the entire screen on every keystroke, followed closely by migrating `ScrollView` maps to `FlatList`.
