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

# Every command below goes through this. It pins BOTH the project and the
# database, and it works in zsh and bash alike.
fb() { firebase "$@" --instance bomedia-official --project bomedia-official; }
```

**Why a function and not `export FBP="--project …"`.** Two traps, both of which
produce output that reads like a finding rather than a mistake:

- **The database.** The project has two: `bomedia-official`, which the app uses
  and which holds everything, and `bomedia-official-default-rtdb`, which is
  empty and is what the CLI targets when you do not name one. A command without
  `--instance` reads the empty database and answers `null`. This is how the
  rules came to be deployed to the wrong database on 2026-08-03.
- **The shell.** `export FBP="--project bomedia-official"` then `$FBP` works in
  bash but **not in zsh**, which is the macOS default: zsh does not word-split
  an unquoted expansion, so the whole string arrives as one argument and every
  command fails with `error: unknown option '--project bomedia-official'`.

Re-define `fb` in each new terminal — a shell function does not survive one.

**Today's bucket key** — several checks need it. It is the LOCAL date:

```bash
export DAY=$(date +%F)          # e.g. 2026-08-02
echo $DAY
```

**Your admin uid** — needed to read your own payment bucket:

```bash
fb database:get /users --shallow
# then, for the uid it prints:
fb database:get /users/<uid>
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
fb database:get /sales/$(date +%Y/%m/%d) --shallow      # find the receipt id
fb database:get /sales/$(date +%Y/%m/%d)/<RECEIPT_ID>
```

Look for, on that node: `subtotal: 600`, `adjustments` containing the mov row,
`totalAmount: 1000`, `totalPaid: 400`, and a **`paymentRefs`** map with one key.

**If it fails** — an `update failed: … is ancestor of another path` error is the
bug fixed in `503c556`; you are on a stale bundle. Run `npx expo start -c`.

☐ receipt id `______________________`

### A5. The advance reached the ledger

**Verify**:

```bash
fb database:get /payments/$DAY/$UID
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
fb database:get /payments/$DAY/$UID
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
fb database:get /payments/$DAY/$UID
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
fb database:get /payments/$DAY
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
fb database:get /payments/$DAY/$UID           # entry is HERE (today)
fb database:get /sales/<Y/M/D of the sale>/<ID>/paymentRefs
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
fb database:get /payments/$DAY/$UID
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
fb database:set /sales/<Y/M/D>/<ID>/voidedAtMs 0
```

**If it succeeds** — the `.validate` pinning void field values is not deployed.
Note that the CLI may bypass rules depending on credentials; the definitive test
is doing it from the app as an admin.

☐

---

## Part E — Staff account

**Blocked without a second account with `role: "staff"`.** Mark it blocked, not
skipped — these rules are deployed and entirely unexercised.

### E0b. Staff can SEE a payment recorded by someone else

**Do** — as staff, open a sale that has a payment recorded by the ADMIN account.
`sales/2026/08/03/INV-260803-O436` has one: ₦5,000 Transfer, taken by Elijah.

**Expect** — the entry is listed, with **Elijah's name on it**, alongside any of
her own. No "you can only see payments you took yourself" message — that copy is
gone, because it stopped being true on 2026-08-04.

**If it fails** — an empty or short list means the entry-level `.read` rule has
regressed. A bare "Permission denied" instead means the per-sale fan-out is
throwing again rather than reporting what it could not read.

☐

### E1. ~~A staff member sees only their own payments~~ — REVERSED 2026-08-04

This step asserted the opposite of the current rule and is replaced by **E0b**
above. It is struck out rather than deleted so that anyone who ran it before
today, or who finds this checklist in an older state, sees that the change was
deliberate.

**What it used to expect:** a staff member sees her own entries on a sale and
NOT the admin's, with the note "You can only see payments you took yourself…".

**Why it changed:** two staff cover the same counter, and a sale a colleague had
collected against looked unpaid to her. The advice was "check with an admin",
which fails at 6pm when the admin is not reachable — and the operator standing
in front of a customer takes the payment again. `payments/{day}/{uid}/{key}` is
now readable by any signed-in user BY EXACT PATH; the day and uid buckets are
still not listable. See the audit, "uid bucketing after 2026-08-04".

**If a staff account today shows only her own entries**, the entry-level `.read`
has regressed — run E0b, which is the live version of this check.

### E2. Staff cannot read the day bucket

> **Still true, and the point of the narrow rule.** Staff may read any single
> entry by its exact path, and may NOT list a day or a colleague's uid bucket.
> If this step starts passing for staff, the rule has been widened past what was
> agreed on 2026-08-04.


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

### E0. Staff can record a payment on an EXISTING sale

**Do this FIRST in Part E.** It is the counter operator's main job, it was
broken from `fee5d65` until 2026-08-04, and nothing in this checklist tested it
— Part E only tested staff READS.

**Do** — as staff, open a sale that already exists (not one you are creating)
and record a payment on it.

**Expect** — it saves. No error.

**Verify**:

```bash
fb database:get /payments/$DAY/$UID | jq 'length'          # $UID = the STAFF uid
fb database:get /sales/<Y/M/D>/<RECEIPT_ID>/paymentRefs | jq 'keys | length'
```

**If it fails** with `update at / failed: permission_denied` — the
`paymentRefs/$key` write rule has regressed. That path has no ancestor grant for
staff on an existing sale: the sale node's staff arm requires `!data.exists()`,
which is false once the sale is there. The ledger entry and `totalPaid` are both
permitted, so the update fails ENTIRELY on the ref — atomicity means all or
nothing, and the operator sees a refusal with no clue which of the three paths
caused it.

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
fb database:get /activity --shallow | jq 'keys | length'

# What the app downloads for that feed today, in bytes: the whole node, which
# is exactly what subscribeToActivity fetches before discarding all but 100.
fb database:get /activity | wc -c
```

Entries run ~200–300 bytes each. Under ~50 KB the fix is **preventive** — worth
doing at this cost, but nothing is hurting yet. Hundreds of KB, or entry counts
in the thousands, and it is **corrective**: that payload is being pulled on every
admin app start.

**Is the whole-tree sales read the 20 KB the re-examination claims?**

```bash
fb database:get /sales | wc -c
fb database:get /sales | jq '[.. | objects | select(has("receiptId"))] | length'
```

The second is the batch count. If the byte figure is over a megabyte, the
deferred read-scoping items move back up the list.

**Where bandwidth actually goes.** Run this, then use the app for a minute —
the report attributes downloaded bytes per path, which is the figure the Stage 4
premise assumed rather than measured. It opens a read stream and writes nothing:

```bash
fb database:profile --duration 60
```

The same figure over a longer window is in the Firebase console under Realtime
Database → Usage → Downloads.

---

## Reporting back

For each failure: the step number, what you saw, and the exact error text if
there was one. A screenshot of the console for the `database:get` output is more
useful than a description — the shape of what landed is usually the answer.

---

## Part F — Offline and recovery (Stage 5)

**Do this part LAST, and on a phone.** None of it is reachable from a unit
test: the failures are airplane mode, a force-quit mid-write, and a write the
rules refuse. Everything before this part assumes writes land; this part is
about what the operator is told when they do not.

Have a paper and pen. That is not a joke — F3 asks you to lose a payment on
purpose, and the paper note is how you know what to re-enter.

### F1. A normal write shows nothing

**Do** — online, record a ₦500 payment on any unpaid sale.

**Expect** — no banner, no chip. The write acked, so there is nothing to say.

**If it fails** — a banner on a healthy write means entries are not being
cleared on ack, and the warning will be permanent background noise within a day.

☐

### F2. Airplane mode — "saved on this phone only"

**Do** — turn on airplane mode. Record a ₦700 Cash payment. Do NOT close the app.

**Expect** —
- the banner reads **saved on this phone only**, and says to keep the app open
  and write it on paper
- the Records row for that sale carries a **Saving** chip
- the balance on screen drops — that is the local echo, and it is exactly the
  lie the banner exists to caption

**Then** turn airplane mode off and wait.

**Expect** — the banner and chip disappear on their own once the server acks.

**If it fails** — if nothing appears, the journal is not registering before the
write. If it never clears after reconnecting, it is not clearing on the ack.

☐

### F3. Force quit mid-write — the failure this stage exists for

**Do** — airplane mode ON. Record a ₦900 POS payment. **Write it on paper.**
Now force-quit the app (swipe it away) WITHOUT turning the network back on.
Turn the network on. Reopen the app.

**Expect** — at startup, before you touch anything:
- the banner says a record **did not save**, or that it **could not be
  confirmed** if the check could not reach the server
- expanding it shows ₦900, POS, and which sale it belonged to
- it asks you to enter it again — it does NOT say it will sync

**Verify** the ledger genuinely does not have it:

```bash
fb database:get /payments/$DAY/$UID | jq '[.[] | select(.amount == 900)] | length'
```

`0` means the payment is genuinely gone, which is the correct and expected
outcome — the SDK's queue is in memory and the force-quit destroyed it. The
banner is the only reason you know.

**Then** re-enter the ₦900 payment by hand and dismiss the entry.

**If it fails** — a banner that says "saving" or "syncing" here is the serious
failure: it tells the operator to wait for something that will never happen.

☐ amount recovered `______________`

### F4. Unverified must not read like progress

**Do** — with an entry outstanding from F3, put the phone on a network that
cannot reach Firebase (airplane mode on, then reopen the app).

**Expect** — the banner says the record **could not be confirmed** and asks for
paper. It must NOT say checking, syncing, retrying, or show a spinner.

**If it fails** — this is the one that quietly undoes the stage. Unverified is
the most common non-clean state, and progress wording turns the most frequent
warning into reassurance.

☐

### F4b. The outbox re-sends a force-quit payment — exactly once

**This is the check that matters most in Part F.** F3 proved the app can tell
you a payment was lost. This proves it can get it back without recording it
twice.

**The sale, and its figures as of 2026-08-03 18:xx** — read from the database so
you do not have to remember anything while force-quitting an app:

| | |
|---|---|
| sale | `sales/2026/08/03/INV-260803-O436` — Idris |
| total | ₦9,200 |
| **`totalPaid` BEFORE** | **₦5,000** |
| balance before | ₦4,200 |

Chosen deliberately because it has already been PART paid. A sale at zero would
pass this test even if the replay wrote `1300` as a literal instead of applying
an increment — starting from 5,000 makes that mistake visible as a wrong number
rather than a right one.

**Do** — confirm the before figure still reads 5000:

```bash
fb database:get /sales/2026/08/03/INV-260803-O436 | jq '{totalPaid, totalAmount}'
```

Airplane mode ON. Record a **₦1,300 Cash** payment on that sale. **Write it on
paper.** Force-quit the app. Turn the network back ON. Reopen and wait for the
banner to settle.

**Expect** —
- the banner appears briefly saying the record is being **sent again**, and says
  NOT to enter it a second time
- it clears itself — no dismiss needed

**Verify** — one entry, and the arithmetic:

```bash
fb database:get /payments/$DAY/$UID | jq '[.[] | select(.amount == 1300)] | length'
fb database:get /sales/2026/08/03/INV-260803-O436 | jq '{totalPaid, totalBalance: (9200 - .totalPaid)}'
```

| `totalPaid` reads | meaning |
|---|---|
| **6300** | ✅ correct — applied exactly once |
| 7600 | ❌ replayed twice, or replayed something that had landed |
| 1300 | ❌ written as a value instead of an increment |
| 5000 | ❌ nothing was re-sent — read what the banner actually said |

Entry count must be **exactly 1**.

**If it fails with 7600** — stop. The duplicate-safety invariant is broken, and
that is worse than the bug the outbox fixes: the money is now wrong rather than
merely missing. Report the entry count and both figures.

☐ entries `____`   ☐ `totalPaid` after `______`

### F4c. It does NOT re-send when it cannot ask

> ⚠️ **NOT RUNNABLE UNDER EXPO GO.** This step needs the app to COLD START while
> offline, and under Expo Go the app cannot start at all without reaching the
> Metro server — the JS bundle is fetched at launch. Airplane mode stops the app
> booting rather than stopping Firebase.
>
> Two ways to run it anyway:
>
> 1. **Keep the LAN, kill the internet.** Leave the phone on the same Wi-Fi as
>    Metro so the bundle still loads, and take the router's uplink down (or use a
>    laptop hotspot with the laptop's own internet off). Firebase is then
>    unreachable while the app boots normally — which is exactly the state this
>    step needs.
> 2. **Build it standalone.** `eas build --profile preview` bundles the JS into
>    the app, so it launches with no network at all. Also the only way to test
>    what your operator actually runs.
>
> Marked **BLOCKED**, not skipped, until one of those happens: the invariant it
> checks — never replay on `unverified` — is the one that separates this feature
> from a duplicate-payment generator, and it is currently proven only by unit
> test.

**Do** — same sale. Airplane mode ON. Record a **₦150** payment. Force-quit.
Reopen the app **still in airplane mode**.

**Expect** — the banner says it **could not be confirmed** and asks for paper.
It must NOT say it is sending again, and nothing must be re-sent.

**Then** turn the network on and reopen. Now it re-sends exactly once.

**Verify** — after reconnecting:

```bash
fb database:get /sales/2026/08/03/INV-260803-O436 | jq .totalPaid
```

Expect **6450** — that is 6300 from F4b plus 150. Anything higher means a
re-send happened while offline, which is replay running on `unverified`: the one
thing it must never do, and a duplicate waiting for a network that already had
the write.

☐ `totalPaid` after `______`

### F5. Permission denied says something a person can act on

**Do** — sign in as the STAFF account and try to void a sale (or any
admin-only write the UI still offers).

**Expect** — a message naming what was not allowed and what to do — ask the
owner to check your role. No error codes, no "Firebase", no stack.

**If it fails** — leaked internals here are what the rewritten copy replaced.

☐

### F6. A render error is recoverable

**Do** — hard to force deliberately; check it opportunistically. If any screen
ever goes blank, note what you were doing.

**Expect** — a readable "Something broke on this screen" with a **Try again**
button, never a white screen.

☐
