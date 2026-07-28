# Role-Based Access Control (RBAC)

BOMedia is an internal tool with two roles. Access is enforced in **two layers**:
Realtime Database **security rules** (the real boundary) and **UI gating**
(hides what a role can't use). Some staff scoping is a UI filter only, by design
— see "UI filter vs. hard wall" below.

## Roles

| Role    | Who            | Set via                                   |
| ------- | -------------- | ----------------------------------------- |
| `admin` | Owner / you    | Firebase console (manual, once — bootstrap)|
| `staff` | Field / sales  | Auto-assigned on first sign-in            |

Roles live at `users/{uid}/role` in the Realtime Database. The role is read into
[`auth-context`](../src/context/auth-context.tsx) and exposed as `role` /
`isAdmin` for UI gating.

## Bootstrap (do this once)

New accounts are created by an admin in the **Firebase Authentication console**
(email/password). On first sign-in the app auto-creates `users/{uid}` with
`role: 'staff'`. To make an account an **admin**:

1. Firebase console → **Realtime Database**.
2. Navigate to `users/<that user's uid>`.
3. Set `role` to `admin` (create the key if the node doesn't exist yet).

The owner's own account was bootstrapped to `admin` this way. There is no
in-app "promote to admin" — this is deliberate (only someone with console
access can grant admin).

## What each role can do

| Capability                               | Admin | Staff                          |
| ---------------------------------------- | :---: | ------------------------------ |
| Create a sale                            |  ✅   | ✅                             |
| Record a payment / collect debt          |  ✅   | ✅                             |
| Move a job on the Production Board        |  ✅   | ✅                             |
| Log an expense                           |  ✅   | ✅ (own, sees only today)      |
| View Records                             |  all  | **today only** (UI filter)     |
| View Clients & debt                      |  ✅   | ✅ (full history — aggregates) |
| Edit a sale's details (notes/due date)   |  ✅   | ❌ (ask an admin)              |
| Delete a sale                            |  ✅   | ❌                             |
| Analytics                                |  ✅   | ❌                             |
| CSV export (Records / Clients)           |  ✅   | ❌                             |
| Settings (materials / pricing / printers)|  ✅   | ❌                             |
| Activity feed                            |  ✅   | ❌ (staff generate it, can't read)|

The **24-hour staff edit window is pended** (not built). For now staff can't
edit sale details at all — they ask an admin, who edits anytime. Staff *can*
still record payments and move production (field-level DB rules allow writing
only `totalPaid` and `productionStage` on existing sales).

## UI filter vs. hard wall

- **Records "today only" for staff** is a UI filter ([`useRecords`](../src/hooks/use-records.ts)
  `staffTodayOnly`), not a rules-level restriction. Clients, the Production
  Board and debt all aggregate across *every* sale client-side, and staff need
  those, so the raw `sales` read stays open to any authenticated user.
- **Expenses "own + today" for staff** is likewise a UI filter
  ([`expenses.tsx`](<../src/app/(tabs)/expenses.tsx>)); the whole `expenses`
  tree is readable by any authed user. Staff-created expenses must carry
  `uid === auth.uid` (enforced by rules).

If a hard wall is ever needed, the sales data model would have to change (e.g.
denormalize per-day indexes) so rules can restrict reads without breaking the
client-side aggregations.

## Activity feed

Every meaningful mutation appends an append-only entry under `activity/{pushId}`
via [`logActivity`](../src/services/activity.ts): sale created, payment
recorded, bulk mark-paid, production moved, expense logged, sale deleted,
invoice details edited. Only admins can **read** the feed (rules); staff can
only **append** (and can't edit or delete entries). The unread badge uses a
per-user "last seen" watermark persisted in AsyncStorage; opening `/activity`
clears it.

## Deploy sequence

Rules live in [`database.rules.json`](../database.rules.json) and are wired via
`firebase.json`. After any rules change:

```bash
firebase deploy --only database
```

Deploy the rules **after** the app build that writes the new fields is live
(so, e.g., staff expense writes already include `uid` before the rule that
requires it is enforced). Order for this RBAC rollout:

1. Ship the app (Phases 1–4).
2. Confirm the owner account has `role: admin` in the console.
3. `firebase deploy --only database`.
