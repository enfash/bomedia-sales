Read the following documentation before making any changes:

AGENTS.md

docs/VISION.md

docs/DESIGN_SYSTEM.md

docs/UI_COMPONENTS.md

docs/UX_PRINCIPLES.md

docs/ARCHITECTURE.md

docs/BRAND_GUIDELINES.md

Your task is to improve the project without changing its core functionality.

Goals

• make the application feel premium

• improve consistency

• improve maintainability

• improve performance

• follow Material Design 3

• maximise component reuse

Always work in phases.

Never skip phases.

────────────────────────────

Phase 1

Review existing implementation.

Identify reusable code.

Identify duplicated logic.

Do not write code.

────────────────────────────

Phase 2

Build reusable UI primitives.

Examples

PrimaryButton

SecondaryButton

StatusChip

SearchBar

BottomActionBar

TransactionCard

CustomerCard

EmptyState

LoadingSkeleton

ErrorState

BottomSheet

Dialog

ThemedTextInput

Do not modify screens yet.

────────────────────────────

Phase 3

Improve theming.

Remove hardcoded colours.

Use theme tokens.

Follow the Brand Guidelines.

────────────────────────────

Phase 4

Extract reusable business logic.

Move duplicated logic into shared utilities.

Create services for Firebase.

Simplify hooks.

────────────────────────────

Phase 5

Refactor one screen at a time.

Dashboard

Sales

Transaction Details

Customers

Inventory

Expenses

Reports

Settings

Pause after every screen.

────────────────────────────

Phase 6

Optimise performance.

Reduce re-renders.

Use FlatList.

Memoise expensive components.

Reduce component size.

Improve navigation performance.

────────────────────────────

Phase 7

Improve UX.

Reduce cognitive load.

Improve spacing.

Improve typography.

Improve accessibility.

Improve empty states.

Improve loading states.

Improve search.

Improve filters.

Improve navigation.

────────────────────────────

Phase 8

Verify.

Check:

Design System compliance

Accessibility

Dark Mode

Light Mode

Responsive layouts

Performance

No regressions

Generate a summary.

Never sacrifice functionality for appearance.

Always preserve user workflows.

Prefer reusable solutions over screen-specific implementations.

Think like a senior product designer, senior frontend engineer and software architect simultaneously.

If uncertain, stop and ask before making architectural changes.
