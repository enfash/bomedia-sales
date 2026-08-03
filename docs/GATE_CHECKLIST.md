# Gate checklist — run this on a device

One list. Stages 1, 2 and 3 all gate on real transactions, and none of them has
had one. This consolidates every check so you are not cross-referencing three
stage documents at a counter.

**Why it exists:** 322 unit tests, clean `tsc`, clean lint and deployed rules
did not stop New Sale being completely broken for any sale taking an advance.
The runtime has now disagreed with what the rules *looked* like they said twice
— once on `.validate` skipping deletes, once on multi-path ancestor paths.
Static checks cannot see either.

## How to use it

Work top to bottom. Each step has:

- **Do** — the action, exactly
- **Expect** — what the screen must show
- **Verify** — what to run to see what actually hit the database
- **If it fails** — what it means, so you know whether to stop

**Stop at the first failure.** Later steps build on earlier ones, and a false
pass downstream is worse than no answer.

Record the outcome inline: `☐` → `✅` or `❌ + note`.

---

## Setup

```bash
# The CLI needs to be logged in. The token expires on its own schedule and the
# 401 it produces reads like a permissions error, not an expiry.
firebase login --reauth          # only if a command below 401s
export FBP="--project bomedia-official"
```

**Today's bucket key** — several checks need it. It is the LOCAL date:

```bash
export DAY=$(date +%F)          # e.g. 2026-08-02
echo $DAY
```

**Your admin uid** — needed to read your own payment bucket:

```bash
firebase database:get /users $FBP --shallow
# then, for the uid it prints:
firebase database:get /users/<uid> $FBP
```

☐ `UID=` ______________________

### Prerequisite for Part E

Part E needs a **second account with `role: "staff"`**. If you do not have one,
Part E cannot run and you should mark it blocked rather than skipped — the
staff read rules are deployed but completely unexercised.

To create one: register a second account in the app, then in the console set
`users/{thatUid}/role` to `"staff"`.

---

## Part A — A sale, and the minimum order value

### A1. A ₦600 job shows the MOV adjustment

**Do** — New Sale. One line item priced **below** the ₦1,000 minimum, e.g. 2ft ×
3ft at ₦100/sqft = ₦600. No delivery. Do not submit yet.

**Expect** on the batch review card:
- Items Subtotal reads **₦600** — the goods alone, not ₦1,000
- A row reads **"Minimum order adjustment +₦400"**
- Order total reads **₦1,000**

**If it fails** — the MOV is being folded into the subtotal again, which is the
bug that made invoices not reconcile against their line items.

☐

### A2. The minimum applies per ORDER, not per line

**Do** — add a second ₦600 line to the same order.

**Expect** — subtotal ₦1,200, and the **MOV row disappears**. Total ₦1,200.

**If it fails** — if the total is ₦2,000, the per-line MOV is back. That is the
pricing change from Stage 1; multi-line orders would be overcharged.

☐

### A3. Delivery does not absorb the minimum

**Do** — remove the second line. Set delivery to ₦2,000.

**Expect** — subtotal ₦600, MOV +₦400, delivery +₦2,000, **total ₦3,000**.

**If it fails** — ₦2,600 means delivery is counting toward the minimum. MOV is a
minimum on printing, not on the invoice.

☐

### A4. Submit, with an advance — the path that was broken

**Do** — set delivery back to 0, enter an advance of **₦400** in Cash, submit.

**Expect** — the sale saves. No error.

**Verify** — the batch, its opening ledger entry and the ref all landed:

```bash
firebase database:get /sales/$(date +%Y/%m/%d) $FBP --shallow      # find the receipt id
firebase database:get /sales/$(date +%Y/%m/%d)/<RECEIPT_ID> $FBP
```

Look for, on that node: `subtotal: 600`, `adjustments` containing the mov row,
`totalAmount: 1000`, `totalPaid: 400`, and a **`paymentRefs`** map with one key.

**If it fails** — an `update failed: … is ancestor of another path` error is the
bug fixed in `503c556`; you are on a stale bundle. Run `npx expo start -c`.

☐ receipt id `______________________`

### A5. The advance reached the ledger

**Verify**:

```bash
firebase database:get /payments/$DAY/$UID $FBP
```

**Expect** — one entry: `amount: 400`, `method: "Cash"`, `receiptId` matching
A4, `note: "Advance taken at sale"`, `byUid` equal to `$UID`.

**If it fails** — if `totalPaid` is 400 but there is no entry, the opening-entry
fix has regressed. Every deposit would be invisible to reconciliation and the
drawer would be over by every advance taken.

☐

### A6. The invoice adds up, on screen and in the PDF

**Do** — open the invoice for that sale. Export the PDF.

**Expect** — both show Subtotal ₦600, Minimum order adjustment +₦400, Total
₦1,000. **The two must agree.**

**If it fails** — the two renderers have drifted. They share one totals object,
so a disagreement means one is reading something else.

☐

---

## Part B — Payments

### B1. Partial payment

**Do** — on a sale with ₦1,000 outstanding, record **₦400** Cash.

**Expect** — balance ₦600, status **Partial**. History shows one entry with
method and your name.

**Verify**:

```bash
firebase database:get /payments/$DAY/$UID $FBP
```

☐

### B2. Second payment on the same invoice — the concurrency fix

**Do** — record the remaining **₦600**, method **POS**.

**Expect** — balance **₦0**, status **Paid**. History shows **two** entries,
newest first, with different methods.

**If it fails** — if only one entry exists, or the balance is wrong, the
read-modify-write is back and one payment silently overwrote the other.

☐

### B3. Bulk mark-paid prompts for a method

**Do** — Records → select two unpaid sales → Mark as paid.

**Expect** — a prompt offering Cash / POS / Transfer. It must **not** proceed
without one.

**If it fails** — a silent default puts untraceable entries in the day's
reconciliation and the drawer will not explain itself.

☐

### B4. Bulk settle is atomic and reports what it settled

**Do** — choose a method and confirm.

**Expect** — a message naming the number of sales **actually settled**, not the
number selected. If one was already paid, it is excluded.

**Verify** — one entry per settled sale, each noted "Marked paid in bulk from
Records":

```bash
firebase database:get /payments/$DAY/$UID $FBP
```

**If it fails** — partial settlement (some paid, some not) means the update is
no longer atomic.

☐

### B5. Daily Cash matches the drawer

**Do** — More → Daily Cash, today.

**Expect** — "Cash that should be in the drawer" equals the **cash** taken in
A4/B1 only. POS and Transfer are excluded — they are in the bank.

**Verify** — the sum of `amount` for `method: "Cash"` in:

```bash
firebase database:get /payments/$DAY $FBP
```

☐

### B6. Reversal shows collected, reversed and net separately

**Do** — as admin, reverse one payment. Give a reason.

**Expect** — three distinct figures. A day that collected ₦1,000 and reversed
₦1,000 must **not** read like a quiet day.

**Verify** — a new entry with a **negative** amount, `reversalOf` naming the
original, and a non-empty `reversalReason`. The original is **unchanged**.

**If it fails** — if the original was edited or removed, the ledger is not
append-only and the rules are not doing what they claim.

☐

---

## Part C — Payments scoping (new surface, never exercised)

### C1. The entry lands in the right bucket, keyed by PAYMENT date

**Do** — take any payment against a sale created on an **earlier** day.

**Verify**:

```bash
firebase database:get /payments/$DAY/$UID $FBP           # entry is HERE (today)
firebase database:get /sales/<Y/M/D of the sale>/<ID>/paymentRefs $FBP
```

**Expect** — the entry sits under **today's** bucket, not the sale's date, and a
`paymentRefs` key appears on the sale pointing at `"{today}/{uid}"`.

**If it fails** — a payment filed under the sale's date would land in the wrong
day's drawer and the reconciliation would never balance.

☐

### C2. The ref key matches the entry key

**Verify** — the key under `paymentRefs` and the key under
`payments/{day}/{uid}` must be **the same string**, and the ref's value must be
`"{day}/{uid}"`.

**If it fails** — the transaction screen looks entries up *through* the ref, so
a mismatch means the payment exists but is unreachable.

☐

### C3. The transaction screen renders through the ref path

**Do** — open that sale's transaction screen.

**Expect** — the payment appears in history with amount, method and who took it.

**If it fails** — this is the scoping change from `fee5d65`. The screen no
longer reads the whole ledger; if the ref is missing or wrong, the payment is
invisible even though `totalPaid` is right. Rebuild with
`planPaymentRefBackfill` — see `DATABASE_RUNBOOK.md`.

☐

### C4. The dashboard banner states the window

**Do** — open the dashboard as admin, with everything reconciling.

**Expect** — at the **bottom**, a quiet line: "No discrepancies in the last 90
days… Older records are not checked here." Nothing at the top.

**If it fails** — silence means the banner is back to inferring a clean state
from data it has not received.

☐

---

## Part D — Void

### D1. Voiding requires the receipt ID typed

**Do** — open the sale from Part A (which has ₦400 collected). Void it.

**Expect** — a dialog requiring the **receipt ID typed exactly** plus a reason.
Neither optional. It must also **name the ₦400 already collected** and say
voiding does not refund it.

☐

### D2. It leaves every total, and stays findable

**Do** — confirm the void.

**Expect**:
- Dashboard revenue **drops** by ₦1,000
- The client's lifetime value drops
- It disappears from the **Board**
- Records → **Voided** filter → it is there, with the reason and who voided it

**If it fails** — a voided sale still counted anywhere means a consumer is not
filtering. There are twelve, plus `fetchBatchesByReceiptIds`.

☐

### D3. The payment SURVIVES the void — the one people get wrong

**Verify**:

```bash
firebase database:get /payments/$DAY/$UID $FBP
```

**Expect** — the ₦400 entry is **still there**, and **Daily Cash still counts
it**.

**If it fails** — if the payment vanished, voiding is wrongly reaching into the
ledger. The cash was really taken; voiding cancels the job, not the money. The
two views answer different questions and both are correct.

☐

### D4. The invoice is stamped VOIDED

**Do** — open that sale's invoice. Export the PDF.

**Expect** — a prominent VOIDED band on screen **and** in the PDF, plus a
watermark in the PDF.

☐

### D5. A void cannot be undone from the app

**Expect** — no un-void control exists anywhere.

**Verify** — the rules pin it. This should be **rejected**:

```bash
firebase database:set /sales/<Y/M/D>/<ID>/voidedAtMs 0 $FBP
```

**If it succeeds** — the `.validate` pinning void field values is not deployed.
Note that the CLI may bypass rules depending on credentials; the definitive test
is doing it from the app as an admin.

☐

---

## Part E — Staff account

**Blocked without a second account with `role: "staff"`.** Mark it blocked, not
skipped — these rules are deployed and entirely unexercised.

### E1. A staff member sees only their own payments

**Do** — sign in as staff. Record a payment on any sale. Open a sale that
**you (admin)** took a payment on.

**Expect** — their own entry is visible. **Yours is not.** The history shows the
note: "You can only see payments you took yourself…"

**If it fails** — if they see your entries, the `payments/$day/$uid` read rule
is not doing its job and this is a second instance of UI-only RBAC.

☐

### E2. Staff cannot read the day bucket

**Expect** — Daily Cash is not reachable from the More menu for staff, and the
screen refuses if reached directly.

☐

### E3. The banner sits in unknown and renders nothing

**Do** — as staff, open the dashboard.

**Expect** — **neither** the discrepancy banner **nor** the clean line appears.

**If it fails** — a staff member seeing a clean verdict is being told the books
agree on the basis of a ledger they can only partly read. That is a false
all-clear, which is worse than no answer.

☐

### E4. Staff cannot void

**Expect** — no void control, and a direct attempt is rejected by the rules.

☐

---

## Appendix — read-only measurements

Not part of the gate. These answer questions the audit's Stage 4 re-examination
(`AUDIT_2026-07.md`) leaves open, and they only read.

> **`--instance bomedia-official` is not optional.** The project has two
> databases: `bomedia-official`, which the app uses and which holds everything,
> and `bomedia-official-default-rtdb`, which is empty and is what the CLI
> targets when you do not name one. A command without the flag reads the empty
> one and answers `null` — which looks like a finding rather than a mistake.
> This is not hypothetical: it is how the rules came to be deployed to the
> wrong database on 2026-08-03. Every `firebase database:*` command in this
> file needs the flag.

**Is the activity `limitToLast` fix preventive or corrective?**

```bash
# How many entries exist. --shallow returns KEYS ONLY, so this does not
# download the feed to count it.
firebase database:get /activity --shallow --instance bomedia-official $FBP | jq 'keys | length'

# What the app downloads for that feed today, in bytes: the whole node, which
# is exactly what subscribeToActivity fetches before discarding all but 100.
firebase database:get /activity --instance bomedia-official $FBP | wc -c
```

Entries run ~200–300 bytes each. Under ~50 KB the fix is **preventive** — worth
doing at this cost, but nothing is hurting yet. Hundreds of KB, or entry counts
in the thousands, and it is **corrective**: that payload is being pulled on every
admin app start.

**Is the whole-tree sales read the 20 KB the re-examination claims?**

```bash
firebase database:get /sales --instance bomedia-official $FBP | wc -c
firebase database:get /sales --instance bomedia-official $FBP | jq '[.. | objects | select(has("receiptId"))] | length'
```

The second is the batch count. If the byte figure is over a megabyte, the
deferred read-scoping items move back up the list.

**Where bandwidth actually goes.** Run this, then use the app for a minute —
the report attributes downloaded bytes per path, which is the figure the Stage 4
premise assumed rather than measured. It opens a read stream and writes nothing:

```bash
firebase database:profile --duration 60 --instance bomedia-official $FBP
```

The same figure over a longer window is in the Firebase console under Realtime
Database → Usage → Downloads.

---

## Reporting back

For each failure: the step number, what you saw, and the exact error text if
there was one. A screenshot of the console for the `database:get` output is more
useful than a description — the shape of what landed is usually the answer.
