# UI Component Audit Checklist

This audit reviews every UI component in the `src/components/` directory against the established project standards (Material Design 3, React Native Paper usage, theme consistency, and design guidelines).

## 1. `app-tabs.tsx` (Navigation Tabs)
- [x] **Material Design 3 compliance:** ❌ Fails. Uses an iOS-style custom pill tab bar rather than standard Material 3 Navigation Bar.
- [x] **React Native Paper usage:** ❌ None. Uses raw `Pressable` and Reanimated.
- [x] **Theme consistency:** ❌ Fails. Ignores `useTheme()` entirely.
- [x] **Hardcoded colours:** ❌ Uses `#0066FF`, `#FFFFFF`, and `rgba(255, 255, 255, 0.6)`. Violates brand colour rule (uses `#0066FF` instead of `#2E388D`).
- [x] **Inconsistent spacing:** ❌ Hardcoded values (`8`, `12`, `20`, `24`, `48`) instead of the `Spacing` constants.
- [x] **Typography hierarchy:** ❌ Hardcoded `fontSize: 14` instead of `ThemedText`.
- [x] **Accessibility:** ❌ Missing `accessibilityRole="button"` and `accessibilityLabel` on tab buttons.

## 2. `desktop-sidebar.tsx` (Sidebar Navigation)
- [x] **Material Design 3 compliance:** ❌ Fails. Custom layout rather than standard Navigation Drawer or Navigation Rail.
- [x] **React Native Paper usage:** ❌ None.
- [x] **Theme consistency:** ❌ Fails. Ignores `useTheme()`.
- [x] **Hardcoded colours:** ❌ Uses `#2e388d`, `#e0e0e0`, `#ffffff`, `rgba(255,255,255,0.7)`, `rgba(255,255,255,0.15)`.
- [x] **Inconsistent spacing:** ❌ Hardcoded padding/margins (`8`, `12`, `16`, `24`, `40`).
- [x] **Typography hierarchy:** ❌ Hardcoded text styles instead of `ThemedText`.
- [x] **Navigation consistency:** ❌ Manually toggled via width rather than using a cohesive responsive layout wrapper.
- [x] **Accessibility:** ❌ Missing accessibility roles for navigation items.

## 3. `records/payment-modal.tsx` (Modal View)
- [x] **Material Design 3 compliance:** ❌ Fails. Uses standard RN `Modal` instead of MD3 Dialog/BottomSheet.
- [x] **React Native Paper usage:** ❌ None. Does not use RNP `Portal` or `Dialog`.
- [x] **Theme consistency:** ⚠️ Partial. Uses `theme` prop, but still hardcodes some colours.
- [x] **Hardcoded colours:** ❌ `rgba(0,0,0,0.5)` for overlay, `#ffffff` for button text.
- [x] **Inconsistent spacing:** ⚠️ Uses `Spacing` for padding, but hardcodes heights (`52`) for inputs and buttons.
- [x] **Typography hierarchy:** ❌ Uses raw `<Text>` for inputs and buttons.
- [x] **Button consistency:** ❌ Ad-hoc `Pressable` submit button instead of a reusable `PrimaryButton`.
- [x] **Card consistency:** ❌ Hardcoded `boxShadow` instead of standard elevation tokens.

## 4. `records/quota-card.tsx` (Summary Cards)
- [x] **Material Design 3 compliance:** ❌ Fails. Uses custom views instead of standard `Surface` or `ElevatedCard`.
- [x] **React Native Paper usage:** ❌ None.
- [x] **Theme consistency:** ✅ Good usage of theme objects.
- [x] **Hardcoded colours:** ❌ `#000` for shadowColor.
- [x] **Inconsistent spacing:** ❌ Hardcoded padding (`16`, `12`), gap (`12`, `4`), and border radius (`12`).
- [x] **Typography hierarchy:** ❌ Raw `<Text>` with sizes (`12`, `20`) instead of `ThemedText`.
- [x] **Card consistency:** ❌ Border radius is 12 (violates `DESIGN_SYSTEM.md` which mandates `16dp`). Hardcoded shadows instead of elevation.

## 5. `records/records-header.tsx` (Search & Filters)
- [x] **Material Design 3 compliance:** ⚠️ Partial. Follows chip patterns but has custom layouts.
- [x] **React Native Paper usage:** ✅ Good. Uses `Menu` and `Chip`.
- [x] **Theme consistency:** ⚠️ Partial. Uses string concatenation (`theme.primary + '20'`) for alpha layers which breaks on some web configs and isn't a robust token.
- [x] **Hardcoded colours:** ❌ `#FFF` for action buttons.
- [x] **Inconsistent spacing:** ❌ Hardcoded heights (`44`), gaps, and paddings.
- [x] **Typography hierarchy:** ❌ Raw `<Text>` with `fontSize: 13`.
- [x] **Button consistency:** ❌ Builds "Generate Invoice" and "Bulk Actions" using raw `Pressable` instead of reusable `PrimaryButton` / `SecondaryButton`.
- [x] **Chip consistency:** ❌ Overrides RNP `Chip` styles heavily instead of using theme configuration.

## 6. `records/records-table.tsx` (Data Lists & Tables)
- [x] **Material Design 3 compliance:** ❌ Fails. Doesn't use standard `DataTable` or `List.Item` specs.
- [x] **React Native Paper usage:** ⚠️ Partial. Uses `Checkbox`, but misses `DataTable`.
- [x] **Theme consistency:** ⚠️ Partial. Relies on string concatenation for opacity (`theme.primary + '20'`).
- [x] **Hardcoded colours:** ❌ `rgba(0,0,0,0.05)`, `'transparent'`.
- [x] **Inconsistent spacing:** ❌ Extensive use of hardcoded padding and widths (`40`, `140`, `90`, `270`, `12`, `8`).
- [x] **Typography hierarchy:** ❌ Raw `<Text>` tags with hardcoded fonts.
- [x] **Card / Chip consistency:** ❌ Custom `statusBadge` views instead of standard `StatusChip`.
- [x] **Accessibility:** ❌ Table rows are simple Pressables. Missing column header semantics for screen readers.

## 7. `ui/collapsible.tsx`
- [x] **Material Design 3 compliance:** ❌ Fails. Custom accordion rather than MD3 standard.
- [x] **React Native Paper usage:** ❌ None. Does not use RNP `List.Accordion`.
- [x] **Inconsistent spacing:** ✅ Good. Uses `Spacing` constants.
- [x] **Theme consistency:** ✅ Good. Uses `ThemedText`/`ThemedView`.

## 8. `themed-text.tsx` / `themed-view.tsx`
- [x] **Hardcoded colours:** ❌ `themed-text.tsx` hardcodes `#3c87f7` for `linkPrimary`.
- [x] **Typography hierarchy:** ⚠️ Has a few ad-hoc sizes (`defaultSemiBold`, `smallBold`) rather than strict MD3 scales (Headline, Title, Body, Label).

## 9. `animated-icon.tsx` / `web-badge.tsx`
- [x] **Hardcoded colours:** ❌ `#3C9FFE`, `#0274DF`, `#208AEF`.
- [x] **Theme consistency:** ❌ Ignores brand colour `#2E388D`.

## Missing Required Components
As per `UI_COMPONENTS.md`, the following core components are **completely missing** from the `src/components/` library and are currently being hardcoded repetitively across screens:
- [ ] `PrimaryButton`
- [ ] `SecondaryButton`
- [ ] `StatusChip`
- [ ] `SearchBar`
- [ ] `KPI Card`
- [ ] `TransactionCard`
- [ ] `CustomerCard`
- [ ] `BottomActionBar`
- [ ] `EmptyState`
- [ ] `LoadingSkeleton`
- [ ] `ErrorState`
