# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Remediation Standing Rules (July 2026 audit)

The findings being worked through are in `docs/AUDIT_2026-07.md`. Read the relevant
section before touching related code.

## Non-negotiables for every task
1. PLAN FIRST. Produce a written plan — files to touch, what changes in each, the
   migration path for stored data, and what could break. Wait for approval before
   editing anything. Never combine planning and execution in one response.
2. Quality gate before every commit: `npx tsc --noEmit` and `npx expo lint` must be
   clean. From Stage 0 onward, `npm test` must also pass.
3. Scope discipline. Fix exactly what the task names. If you spot something else,
   add it to a "Noticed, not fixed" list at the end — do not opportunistically
   refactor.
4. Never break existing stored data. Any change to the shape of data under
   `sales/`, `quotes/`, `expenses/` or `activity/` needs a migration script in
   `scripts/`, dry-run by default, `--commit` to write, and it must be idempotent.
5. Money is never a bare float in arithmetic. Round at every write boundary.
6. Financial records are never hard-deleted. Void, don't remove.
7. All data access goes through the repositories in `src/services/`. Never build a
   Firebase path in a screen or component.
8. Status labels and colours come from `STATUS_META` only.
9. No new hardcoded hex colours. Use `useTheme()`, `STATUS_META`, or
   `withAlpha()` from `src/utils/color.ts`.
10. Cross-platform: if a change affects a screen that has a `.web.tsx` twin, state
    in the plan whether the twin needs the same change. Fixing one and not the
    other is a bug.
11. Update `docs/PROJECT_STATUS.md` and `docs/CHANGELOG.md` at the end of each stage.

# Brand & Colour System

This application follows Material Design 3.

The brand identity must remain consistent throughout the project.

## Primary Brand Colour

The official brand colour is:

Primary = #2e388d

This colour should never be replaced or changed.

Use it for:

- Primary Buttons
- Active FAB
- Active Bottom Navigation
- Active Tabs
- Selected Chips
- Links
- Icons requiring emphasis
- Focus indicators
- Progress indicators

Use darker shades only for pressed states.

Preferred pressed colour:

#141f76

Never invent new primary blues.

---

## Colour Palette

### Primary

Primary:
#2e388d

Primary Pressed:
#141f76

Primary Container:
#939efe

On Primary:
#ffffff

---

### Background

Background:
#f8f9ff

Surface:
#f8f9ff

Surface Lowest:
#ffffff

Surface Low:
#eff4ff

Surface:
#e5eeff

Surface High:
#dce9ff

Surface Highest:
#d3e4fe

---

### Text

Primary Text:
#0b1c30

Secondary Text:
#454651

Inverse Text:
#eaf1ff

---

### Borders

Outline:
#767683

Outline Variant:
#c6c5d3

---

### Error

Error:
#ba1a1a

Error Container:
#ffdad6

---

## Status Colours

Status colours communicate meaning only. Never use them for branding.

**`STATUS_META` in `src/utils/payment-status.ts` is the source of truth.** The
table below documents it; it does not define it. If the two ever disagree, the
code is right and this file is stale — fix this file.

There are five payment statuses, and they are the only ones. An earlier version
of this document listed "Part Paid", "Outstanding" and "Cancelled", none of
which exist in the code, and omitted Overdue and Overpaid, which do.

| Status | Label | Text | Background | Chip |
|---|---|---|---|---|
| `Paid` | Paid | `#1c7d4d` | `#d9f2e4` | outlined |
| `Partial` | Partially paid | `#b26a00` | `#ffeccc` | outlined |
| `Unpaid` | Unpaid | `#ba1a1a` | `#ffdad6` | outlined |
| `Overdue` | Overdue | `#ffffff` | `#8c0009` | **filled** |
| `Overpaid` | Overpaid | `#2e388d` | `#e5eeff` | outlined |

Overdue is the only filled chip. It was previously byte-identical to Unpaid —
same text colour, same background — which made the one status needing action
today indistinguishable from the one that does not. It now differs by fill as
well as hue, so the distinction survives a red-green colour deficiency.

Status is always *derived* from amounts and the due date by
`computePaymentStatus`. A stored `status` string is never trusted on read.

---

## Surface Rules

Most screens should use:

Background:
#f8f9ff

Cards should use:

#ffffff

Avoid coloured cards unless conveying meaning.

Use elevation before changing colours.

---

## Colour Usage Rules

Use colour sparingly.

Hierarchy should come from:

- Typography
- Spacing
- Size
- Elevation

Not colour.

Avoid colourful interfaces.

The interface should feel calm, professional and finance-oriented.

---

## Buttons

Primary Button

Background:
#2e388d

Text:
White

Secondary Button

Outlined

Border:
Outline colour

Background:
Transparent

Destructive Button

Only use Material Error colours.

Never use the primary blue.

---

## Cards

Cards should normally be white.

Rounded corners:

16dp

Soft elevation.

Avoid coloured card backgrounds.

Dashboard summary cards may use subtle surface colours.

---

## Icons

Normal Icons

Secondary text colour.

Important Icons

Primary colour.

Warning Icons

Material Error colour.

Success Icons

Paid green.

---

## Charts

If charts are added later:

Primary Series:
#2e388d

Secondary Series:
#4b56b0

Neutral Series:
#767683

Success:
#2E7D32

Warning:
#EF6C00

Error:
#C62828

Avoid rainbow colour palettes.

---

## Dark Theme

Do not manually create dark colours.

Always derive colours from the existing Material Design theme.

All components must automatically inherit colours from:

useTheme()

or

ThemedView

ThemedText

Never hardcode dark mode colours.

---

## Design Philosophy

The application should resemble modern finance software.

Preferred inspiration:

- Google Wallet
- Monzo
- Revolut
- Stripe
- Notion
- Gmail

Avoid looking like:

- E-commerce stores
- Food delivery apps
- Crypto dashboards with excessive colours
- Gaming interfaces

The UI should feel calm, trustworthy, and professional.


# Data Density Rule

Every screen must follow the "Progressive Disclosure" principle.

Show only the information required to make the next decision.

Hide secondary information until the user requests it.

Example:

Transaction List

Show:

- Customer
- Status
- Date
- Total
- Item Count

Hide:

- Item breakdown
- Payment history
- Invoice details
- Notes
- Attachments

Those belong on the Transaction Details screen.

Always optimise for fast scanning before information density.


## Before implementing any feature

See docs/DESIGN_SYSTEM.md, docs/UI_COMPONENTS.md, docs/BRAND_GUIDELINES.md, docs/UX_PRINCIPLES.md and docs/ARCHITECTURE.md before implementing features.

## Development Workflow
1. Read existing code before creating new files.
2. Reuse existing components whenever possible.
3. Follow current folder structure and naming conventions.
4. Extend existing architecture instead of creating parallel implementations.
5. Keep code consistent with the project style.
6. Minimise duplication.
7. Explain significant architectural or routing changes before implementing them.
8. Recommend the simplest maintainable approach first.
9. Do not rewrite working code without clear benefit.
10. Keep changes focused.


# Screen Layouts & Padding Rule (Learned)

Always use the `<PageContainer>` component from `@/components/ui/page-container` as the top-level scroll wrapper for all screens.
Do NOT manually apply `maxWidth`, `alignSelf: 'center'`, or horizontal padding to `ScrollView` or `View` wrappers for the main screen layout.
To ensure screens fit 100% on phone screens (edge-to-edge), `<PageContainer>` handles applying `0` horizontal padding on mobile natively, while applying constraints on desktop/web.
Ensure that inner elements (like `Surface` cards) provide their own internal padding.
