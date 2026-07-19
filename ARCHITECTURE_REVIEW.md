# Architecture Review

This document provides a review of the current project architecture, identifying structural issues, code duplication, and opportunities for reuse and refactoring.

## 1. Large Files & Components with Multiple Responsibilities

The `src/app/` directory contains excessively large screen components that violate the Single Responsibility Principle (SRP). These files act as views, state managers, form validators, gesture handlers, and database clients all at once.

- **`new-sales.tsx` (1131 lines):** Acts as the UI layout, form state manager, custom `PanResponder` gesture handler for a bottom sheet, subtotal/tax calculator, and handles direct Firebase database writes.
- **`invoice.tsx` (714 lines):** Handles data fetching, UI rendering, complex layout calculations, and PDF generation.
- **`board.tsx` (631 lines):** Manages deal state transitions, calculates pipeline totals, and handles intricate responsive UI layouts.
- **`settings.tsx` (603 lines):** Manages local state for multiple tabs, syncs with a context, and handles direct database writes.

**Recommendation:** Break down screens into smaller feature-based components (e.g., `NewSalesForm`, `MaterialBottomSheet`, `InvoicePreview`).

## 2. Duplicate Business Logic

- **Payment Status Calculation:** The logic to determine if a record is `"UNPAID"`, `"PARTIAL"`, `"PAID"`, `"OVERPAID"`, or `"OVERDUE"` is implemented in `src/hooks/use-records.ts` (lines 86-98). This exact same logic is duplicated manually in `src/app/invoice.tsx` (lines 93-104).
- **Data Fetching:** Direct Firebase database calls (`ref`, `get`, `onValue`) are scattered across UI components. For instance, `invoice.tsx` manually fetches sales from Firebase, replicating the data-fetching responsibility of `use-records.ts`.
- **Form UI:** The raw `<TextInput>` with standard wrappers and label styling is repeated dozens of times across `new-sales.tsx` and `settings.tsx`.

**Recommendation:** 
- Extract shared domain logic (like `getPaymentStatus`) into a `src/lib/utils/` folder.
- Extract form inputs into a reusable `ThemedTextInput` component.

## 3. Incorrect Folder Organisation

- **Types:** Application types are hidden inside `src/components/records/types.ts` instead of residing in a centralized `src/types/` folder.
- **Data Access:** There is no `src/services/` or `src/api/` layer. React Components are tightly coupled to the Firebase SDK.
- **CSS Modules:** `animated-icon.module.css` is placed directly in `src/components/`, which is unusual for an Expo project and should be either avoided (favouring `StyleSheet.create`) or moved to a dedicated styles directory.
- **Empty Directories:** `src/config/` is currently empty and serves no purpose.

**Recommendation:** 
- Create a `src/types/` folder for global interfaces.
- Create a `src/services/` folder to abstract Firebase interactions.
- Remove empty folders like `src/config/`.

## 4. Duplicate Components

- **Platform Splits (`.web.tsx` vs `.tsx`):** Components like `app-tabs` and `animated-icon` have separate web and native implementations. While sometimes necessary, they currently duplicate a lot of presentation logic that could be decoupled from the platform-specific APIs.

**Recommendation:** Ensure that only the platform-specific API calls are separated into `.web.tsx` files, while the rendering logic is shared as much as possible.

## 5. Opportunities for Reuse

- **`BottomSheet` Component:** `new-sales.tsx` implements a custom, complex `PanResponder` animation for a bottom sheet. This should be extracted into a reusable `<BottomSheet>` component in `src/components/ui/`.
- **`LoadingState` / `EmptyState`:** Screens like `invoice.tsx` and `records.tsx` manually implement their own `<ActivityIndicator>` wrappers and error text. A centralized `<LoadingSkeleton>` and `<EmptyState>` should be built.
- **Repository Hooks:** Creating a centralized `useSales()` and `useInvoices()` hook/service would remove the need for individual screens to import `db` and `ref` from Firebase, standardising error handling and loading states.
