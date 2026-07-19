# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

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

Status colours should communicate meaning only.

Never use them for branding.

Paid

Background:
#E8F5E9

Text:
#2E7D32

Part Paid

Background:
#FFF4E5

Text:
#EF6C00

Outstanding

Background:
#FDECEC

Text:
#C62828

Cancelled

Background:
#ECEFF1

Text:
#546E7A

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


[1]: https://docs.expo.dev/agents/?utm_source=chatgpt.com "AI agents and Expo overview - Expo Documentation"

# Screen Layouts & Padding Rule (Learned)

Always use the `<PageContainer>` component from `@/components/ui/page-container` as the top-level scroll wrapper for all screens.
Do NOT manually apply `maxWidth`, `alignSelf: 'center'`, or horizontal padding to `ScrollView` or `View` wrappers for the main screen layout.
To ensure screens fit 100% on phone screens (edge-to-edge), `<PageContainer>` handles applying `0` horizontal padding on mobile natively, while applying constraints on desktop/web.
Ensure that inner elements (like `Surface` cards) provide their own internal padding.
