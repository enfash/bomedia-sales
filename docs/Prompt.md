Remediation Prompt Pack

Do not paste all of this at once. One stage per session. Each stage ends with a green quality gate and a commit, so if a session goes sideways you lose one stage, not the app.

Before you start:

check  docs/AUDIT_2026-07.md and commit it. Every prompt below references it.
Append the Standing Rules block (Section A) to AGENTS.md and commit. That way every session inherits the constraints without you re-typing them.
Create a branch per stage: git checkout -b fix/stage-1-correctness.

Always ask to continue to next stage


Stage prompts
Stage 0 — Test harness and failing tests

Read docs/AUDIT_2026-07.md, sections 1.3 and 1.4.

This project has 14,000 LOC of financial logic and zero tests. Before any behaviour changes, I want a test harness plus failing tests that pin down four known bugs, so the fixes in the next stage are provably correct.

Set up Jest with jest-expo and @testing-library/react-native, configured for this repo's @/* path aliases and TypeScript. Add a test script and a test:watch script.

Then write unit tests for the pure functions only — src/services/analytics.ts, src/utils/payment-status.ts, src/utils/date.ts, and the normalizers in src/services/sales-repository.ts (parseSalesTree, normalizeBatch, normalizeItem, adaptLegacyRecords). No component tests in this stage.

Include tests that currently FAIL and document why, for these four bugs:

computeDashboardMetrics uses toISOString().split('T')[0] to decide "today", which is UTC. Lagos is UTC+1, so a sale at 00:30 WAT is excluded from today's figures. Write a test with a batch timestamped 00:30 WAT that asserts it counts toward todaySales.
normalizeBatch derives overdue from isOverdue(node.createdAt) with a fixed 7-day threshold and ignores dueDate entirely. Write a test asserting that a batch created 10 days ago with a dueDate 20 days out is NOT Overdue, and one created 3 days ago with a dueDate yesterday IS Overdue.
formatCurrency uses bare toLocaleString(), so accumulated float error renders fractional kobo. Write a test asserting formatCurrency(1234.5600000000001) returns ₦1,235.
STATUS_META.Overdue and STATUS_META.Unpaid are byte-identical. Write a test asserting their color values differ.

Also add a GitHub Action at .github/workflows/ci.yml running tsc --noEmit, expo lint and jest on push and PR to main.

Give me the plan first. Do not fix any of the four bugs in this stage — only prove they exist.

Stage 1 — Correctness fixes (P0, low risk)

Read docs/AUDIT_2026-07.md, sections 1.3 and 1.2(E). The failing tests from Stage 0 define done: all four must go green, and every existing test must stay green.

Fix these six things and nothing else:

Double-submit on New Sale. src/app/(tabs)/new-sales.tsx — submitBatch has no in-flight guard, so a double tap on a slow connection creates two real sales. Add isSubmitting state, disable the primary button and show a loading state while awaiting. Also replace the bare alert() validation call with Alert.alert for consistency with the rest of the function.
UTC "today". src/services/analytics.ts — replace every toISOString().split('T')[0] date comparison with local-date helpers. Add isSameLocalDay(a, b) and localDayKey(date) to src/utils/date.ts and use them. Audit the whole repo for other instances of this pattern and fix them too. The app must have exactly one definition of "today", matching the local date components createBatch already uses to build its storage path.
dueDate ignored. dueDate is written, stored, and editable in the UI, then never read. Add defaultTermsDays (default 7) to AppSettings in src/context/settings-context.tsx and expose it in the admin Settings screen. Change overdue derivation so it uses dueDate when present and falls back to createdAt + defaultTermsDays. Note in your plan how the settings value reaches normalizeBatch, which is currently a pure function with no settings access — I'd prefer the threshold passed in rather than the repository importing context.
Money rounding. Round to whole Naira at every write boundary in sales-repository.ts and quote-repository.ts (createBatch, recordPayment, markBatchesPaid, and quote equivalents). Pin formatCurrency to toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 }). Add formatCurrencyCompact() for dashboard KPI cards — ₦2.4M, ₦450K — and use it in StatCard / KpiCard only, not in tables or invoices.
Overdue vs Unpaid are visually identical. Give Overdue its own treatment in STATUS_META — it's the status that demands a phone call today, and it currently looks exactly like Unpaid. Deeper red plus a filled chip against Unpaid's outlined one. Note that AGENTS.md's status palette (Paid/Part Paid/Outstanding/Cancelled) has drifted from the code's STATUS_META vocabulary — reconcile them and update AGENTS.md so there's one palette.
Minimum Order Value is silent. new-sales.tsx does Math.max(batchSubtotal, settings.mov), so a ₦600 order silently becomes ₦1,000 with no line item and no explanation — the customer's invoice won't reconcile against the item list. Surface it as a labelled adjustment row ("Minimum order adjustment: +₦400") in BatchReviewCard, in the batch total breakdown, and on the invoice HTML in src/app/invoice.tsx. Store the adjustment on the batch node so historic invoices stay reproducible.

Plan first. Flag anywhere a .web.tsx twin needs the same change.

Stage 2 — Payment ledger (the important one)

Read docs/AUDIT_2026-07.md, section 1.2(B). This is the highest-value change in the audit. Take it slowly and give me a thorough plan — I expect to iterate on the plan before you write code.

The problem. recordPayment does a client-side read-modify-write on a float:

ts
const next = (batch.totalPaid || 0) + amount;
await dbService.updateRecord(batch.dbPath, { totalPaid: next });

Two devices recording payments concurrently means one silently disappears. And because totalPaid is a single mutable number, there is no record of who collected what, when, or by which method. logActivity writes a prose sentence into an admin-only feed — that's a notification, not an accounting record. It cannot be summed or reconciled.

The target. Payments become append-only child records:

sales/{YYYY}/{MM}/{DD}/{receiptId}/payments/{pushId}
  { amount, method, atMs, at, byUid, byName, note?, reversalOf? }
Corrections are new entries with a negative amount and reversalOf pointing at the original. Payment entries are never edited or deleted.
totalPaid stays on the batch node as a cache, but is maintained transactionally — runTransaction or increment() — never read-modify-write from client state.
normalizeBatch should expose a normalized payments: PaymentEntry[] array on SalesBatch, sorted newest first, and should treat the sum of payments as authoritative if it disagrees with the cached totalPaid (and log the discrepancy).

Scope of the change:

New PaymentEntry / StoredPayment types in src/components/records/types.ts.
recordPayment rewritten; add reversePayment(batch, paymentId, reason). markBatchesPaid writes a real payment entry for the balancing amount rather than overwriting totalPaid.
payment-modal.tsx captures method (Cash / POS / Transfer) and an optional note. Currently the method is only captured at sale creation and never for subsequent payments — that's the gap that makes reconciliation impossible.
Payment history shown on the transaction detail screen (src/app/transaction/[id].tsx) — date, amount, method, who took it. Per the Data Density Rule in AGENTS.md this belongs on the detail screen, not the list.
Security rules in database.rules.json: payment entries are create-only for staff and admin, never updatable or deletable by anyone; .validate that amount is a number and byUid === auth.uid. Reversals admin-only.
Migration scripts/migrate-payments.mjs: for every existing batch with totalPaid > 0, write one synthetic opening payment entry (method: 'Unknown', byName: 'Migrated', atMs = batch createdAtMs or parsed createdAt, note: 'Opening balance migrated from totalPaid'). Dry-run by default, --commit to write, idempotent — re-running must not double up. Report a before/after total so I can verify no money moved.

Also build the payoff, in the same stage: a Daily Cash Reconciliation view for admin — for a chosen date, total collected split by method and by staff member, so the figure can be checked against what's physically in the drawer. This is the reason the ledger is worth building; don't leave it for later.

Tests required: concurrent-payment safety (two increments both land), reversal arithmetic, sum-of-payments vs cached totalPaid reconciliation, and the migration's idempotency.

Plan first, and tell me explicitly what could go wrong with the migration.

Stage 3 — Void instead of delete

Read docs/AUDIT_2026-07.md, section 1.4, "Hard deletes".

deleteBatch calls remove(), permanently erasing a financial record — and after Stage 2, its entire payment history with it. Cancelled jobs are normal in printing; erasing them is not.

Replace hard delete with soft void across sales and quotes:

Add voidedAt, voidedAtMs, voidedBy, voidedByName, voidReason to the stored batch shape, and an isVoided flag on the normalized type.
voidBatch(batch, reason) replaces deleteBatch. Admin only, reason mandatory. Log to the activity feed.
Voided batches are excluded from all totals, KPIs, analytics selectors and the Board by default. Audit every consumer of subscribeToBatches — there are five — and confirm each one filters. This is the part most likely to be missed, so list them explicitly in your plan.
Add a "Voided" filter option in Records so they remain findable.
Confirmation requires typing the receipt ID, not just tapping OK.
Security rules: no client may remove() a sale, quote, or payment. Void is an admin-only field write.

Tests: voided batches excluded from computeDashboardMetrics, from client aggregation, and from outstanding-balance totals.

Plan first.

Stage 4 — Scoped subscriptions and rollups

Read docs/AUDIT_2026-07.md, section 1.2(A). This is the change that decides whether the app still works in two years. Plan carefully; I expect this to take more than one session and I'd rather it be staged than rushed.

The problem. subscribeToBatches subscribes to the entire sales root and re-walks the whole tree on every write. Five surfaces consume it — Records, Clients, Board, Dashboard, Analytics. At 20 sales/day, two years of trading means roughly 8 MB re-downloaded every time someone moves a kanban card. On Lagos mobile data that's unusable and it costs real airtime. The date-bucketed path sales/{YYYY}/{MM}/{DD}/{receiptId} was designed to prevent exactly this, and the read path ignores it.

Part 1 — scope the reads.

Add subscribeToBatchesInRange(fromDate, toDate) to sales-repository.ts, subscribing to the specific sales/{YYYY}/{MM} month nodes in range and merging results. Keep the whole-tree read available but rename it subscribeToAllBatchesUnscoped() with a comment saying it's for migrations and admin exports only.
useRecords takes a range, defaulting to the current month. "All time" becomes an explicit, deliberate user action with a warning that it's a large download.
Board and Dashboard default to the current month.
activity.ts:subscribeToActivity currently downloads the entire log and slices client-side — use limitToLast(limit) instead. atMs exists for this and is being wasted.
use-all-expenses.ts subscribes to every month by design — give it a range too.
Add .indexOn to database.rules.json for every child used with orderByChild. Without it Firebase downloads and sorts client-side and logs a warning.

Part 2 — rollups. Clients and Analytics legitimately need cross-period totals, so they can't just be range-scoped. Maintain aggregates written transactionally on each sale, payment, void and expense:

aggregates/monthly/{YYYY-MM}  { revenue, collected, outstanding, jobCount, batchCount, expenses }
aggregates/clients/{clientKey} { name, lifetimeValue, collected, balance, jobCount, lastOrderAtMs }
Analytics and the Clients list read aggregates. Drilling into one client reads that client's actual batches.
Write a scripts/rebuild-aggregates.mjs that recomputes everything from raw data — dry-run by default, idempotent. This is both the backfill and the repair tool for when a rollup drifts, which it eventually will.
Keep the existing pure selectors in analytics.ts working against raw batches so they stay testable and stay the reference implementation. Add a test asserting rollups and selectors agree on the same fixture — that test is what protects you from silent aggregate drift.

Tell me in the plan whether you'd split this into two sessions, and where the seam is.

Stage 5 — Offline UX

Read docs/AUDIT_2026-07.md, section 2.2, "No offline story".

The Firebase RTDB SDK queues writes when offline, which means await dbService.setRecord(...) never resolves with no connection. My operator taps Submit, nothing happens, no spinner ends, no error appears — so they tap again. In Lagos this is the normal condition, not an edge case.

Build:

A connection state hook reading Firebase's .info/connected, plus a persistent, unobtrusive offline indicator in the app chrome (both the native tab bar and the web sidebar).
Optimistic writes: a new sale appears in Records immediately with a "Pending sync" chip, resolving when the server confirms. Same for payments and production-stage moves.
Submit buttons that resolve their loading state on local write acceptance, not on server round-trip, with clear copy: "Saved on this device — will sync when you're back online."
Rewrite every user-facing error string that leaks internals. "Failed to submit batch. Check your connection or Firebase config." — my operator cannot check a Firebase config. Say what happened and what to do next.
A root error boundary in src/app/_layout.tsx with a recoverable fallback. One render throw in a chart currently gives a white screen with no way out.

Plan first. Cover both native and web.

Stage 6 — Real clients collection

Read docs/AUDIT_2026-07.md, section 2.2, "Client name is free text".

clientName is a free-text string and clients.web.tsx aggregates by exact string match. Blessing Prints, blessing prints and Blessing Print become three customers with three separate balances, so the debt view quietly under-reports what I'm owed.

Build:

clients/{clientId} — { name, normalizedName, phone?, email?, address?, createdAtMs, notes? }, plus a clients-repository.ts.
Batches and quotes store clientId and keep the clientName string as an immutable snapshot on the record, so a later rename doesn't rewrite historic invoices.
Typeahead on the New Sale and Quote client fields — search existing clients as you type, create-new as an explicit option rather than a silent default.
Admin merge-duplicates: pick a survivor, repoint clientId on all its batches and quotes, keep an audit entry.
scripts/migrate-clients.mjs — derive clients from distinct normalized names in existing sales and quotes, group obvious duplicates (case, whitespace, punctuation), and produce a review report I can approve before the merge is committed. Do not auto-merge on fuzzy similarity without my sign-off; two genuinely different customers with similar names is a worse outcome than a duplicate.
Client detail view: history, lifetime value, outstanding balance, last order.

Then build the payoff: a Debtors view sorted by age of balance, with one tap to open WhatsApp on a pre-filled polite reminder including the receipt ID and amount. That's the feature that turns a report into collected cash, and it's the reason this stage is worth doing.

Plan first.

Stage 7 — Hygiene and accessibility

Read docs/AUDIT_2026-07.md, sections 1.5 and 2.2. This is a cleanup stage — no behaviour changes. Work through it in order and commit each item separately so anything that regresses is easy to bisect.

Accessibility. 14 accessibility props across 10 files, against 72 components. Add accessibilityLabel and accessibilityRole to every icon-only control — icon-button.tsx, Board stage controls, DataTable sort headers, the More menu, nav items. Audit touch targets against 44×44 and fix any that fall short.
121 hardcoded hex colours across src/app and src/components, despite the theme plus STATUS_META rule. Replace them all with useTheme(), STATUS_META, or withAlpha(). Add an ESLint rule banning raw hex in src/app and src/components so this can't come back.
Dark mode. Colors in src/constants/theme.ts has only a light key and still carries the Expo template's boilerplate comment, while use-color-scheme.ts and Paper's dark theme are both live. AGENTS.md says never hardcode dark colours and always derive from the MD3 theme. Either complete dark mode properly through Paper, or delete the dead scaffolding. Recommend which, and why, before doing either.
Type the create path. batchItems: any[] in new-sales.tsx means the core sale-creation path is unverified against StoredItem. Type it properly and type JobDetailCard's output. Then reduce the remaining 79 anys where it's low-risk; list any you'd rather leave alone and say why.
Config. Move the Firebase config out of src/lib/firebase.ts into app.config.ts with EXPO_PUBLIC_* env vars, so staging and production can differ. Remind me to restrict the API key by referrer and package name in the Google Cloud console — that's a console task, not a code one.
Magic numbers into Settings. targetRevenue = 1000000 in use-records.ts, and anything similar you find.
Search. useRecords matches only client name and material. Staff search by receipt ID and phone number — add both.
Empty states. empty-state.tsx is reused generically. Make first-run empties teach: the empty Board should say jobs appear once a sale is recorded, with a link to New Sale.
Legacy shim. Confirm scripts/migrate-sales.mjs has been run against production, then delete adaptLegacyRecords from sales-repository.ts. It currently double-walks the tree on every sync. Ask me to confirm the migration ran before deleting anything.

Plan first, and tell me if any item is riskier than it looks.

C. Two things not in any stage

Web/native fork refactor. The screen-level .tsx / .web.tsx split duplicates business logic across roughly 1,700 LOC and will drift. The fix is to push the split down to presentation components. Don't attempt it until Stages 1–6 are done, because those stages change the shared logic and you'd be refactoring a moving target.

Backup export. Not in the audit's priority list, but you have exactly one copy of your entire business history in one Firebase project with no export routine. A scheduled JSON dump to Drive is a half-day job. Do it whenever you have a spare afternoon — ideally before Stage 2's migration touches every payment record.

Content


Stage 1 → Stage 2. Move on when all five hold, docs/Prompt.md

grep -rn "it.failing(" src/ returns nothing.
npm test, tsc --noEmit, expo lint all clean; CI green.
The four amend-then-flip ratchets assert on real subtotal/adjustments[] fields, and BatchWithMoneyFields is deleted from the test file.
money.ts exists and is the only place line-total, subtotal, MOV and batch-total arithmetic lives — nothing computed inline in job-detail-card.tsx or new-sales.tsx.
You've opened the app and recorded a real sale. A ₦600 job should show a visible "Minimum order adjustment: +₦400" row, and the invoice PDF should add up. No amount of green CI substitutes for this — the audit's whole method has been static so far.

Then, before Stage 2 starts: run scripts/migrate-sales.mjs (dry-run, then --commit) and delete adaptLegacyRecords. Outstanding since 24 July. Stage 2's payment migration walks the same nodes and you don't want them overlapping.