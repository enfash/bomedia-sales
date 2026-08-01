# Migration runbook — legacy flat sales records

## Run order

| # | Step | Section |
|---|---|---|
| 0 | Download the service account key | [1](#1-download-the-service-account-key) |
| 1 | **Export (pre-correction)** | [3](#3-database-exports--required-twice) |
| 2 | Inspect `-OxdknkSYS_9ADlSCqug` and the three sequential records | [5b](#5b-records-to-inspect-before-correcting) |
| 3 | Correct or delete — all three fields together if correcting | [5c](#5c-documented-correction--oxdknksys_9adlscqug-2026-08-01) |
| 4 | Re-run the dry run | [2](#2-dry-run) |
| 5 | **Export (pre-migration)** | [3](#3-database-exports--required-twice) |
| 6 | `--commit` | [4](#4-commit) |
| 7 | Delete `adaptLegacyRecords` | [6](#6-delete-the-legacy-shim) |
| 8 | Stage 2 | [5a](#5a-stage-2-gate--a-concrete-check-not-a-general-assertion) |

Two exports, not one, and the first goes **before** any correction. Do not skip
either.

---

## 1. Download the service account key

The migration uses the **Firebase Admin SDK**, which bypasses database rules.
This is deliberate: deleting the old flat records at `sales/{recordId}` is
denied for *every* role, including admin, because the only `.write` rule under
`sales` sits at `sales/$y/$m/$d/$id` and root is `.write: false`. The rules stay
tight for the app; the one-off script gets its own credential instead.

In the Firebase console:

1. Open **[console.firebase.google.com](https://console.firebase.google.com)** and select **bomedia-official**.
2. Click the **gear icon** (top left, beside "Project Overview") → **Project settings**.
3. Open the **Service accounts** tab.
4. Make sure **Firebase Admin SDK** is selected and the config language is **Node.js**.
5. Click **Generate new private key**, then **Generate key** in the dialog.
6. A JSON file downloads, named something like
   `bomedia-official-firebase-adminsdk-a1b2c-0123456789.json`.

Put it here and rename it:

```bash
mkdir -p secrets
mv ~/Downloads/bomedia-official-firebase-adminsdk-*.json \
   secrets/bomedia-service-account.json
```

`secrets/` and every `*-service-account*.json` / `firebase-adminsdk-*.json`
pattern are in `.gitignore`. Verify before you go further:

```bash
git check-ignore -v secrets/bomedia-service-account.json   # must print a match
git status --porcelain | grep -i secret                    # must print nothing
```

> **This key is equivalent to full database access with no rules.** Never commit
> it, never paste it into chat or a ticket, and delete it once the migration is
> done. If it leaks, revoke it immediately from the same Service accounts tab.

Point the script at it:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=./secrets/bomedia-service-account.json
```

---

## 2. Dry run

```bash
npm run migrate:sales
```

Writes nothing. Prints, per record: old path, new path, old total, new total,
and any adjustment row derived — then a grand-total summary.

**Read the last three lines.** If the aggregate moves, the script says so in a
banner rather than a footnote:

```
  Grand total before : ₦1,687.50
  Grand total after  : ₦1,688
  !!  THE AGGREGATE MOVES BY +₦0.50
```

A non-zero delta is rounding line totals to whole naira. Small is expected;
anything you cannot account for means stop and investigate.

If it reports **no legacy records**, the migration is a no-op — skip to step 6
and delete the shim.

---

## 3. Database exports — REQUIRED, twice

**Export before the correction, and again before the migration.** Two files,
named distinctly:

| When | Filename |
|---|---|
| Before touching any record | `bomedia-rtdb-2026-08-01-pre-correction.json` |
| After correcting, before `--commit` | `bomedia-rtdb-2026-08-01-pre-migration.json` |

### Why two

A backup's job is not to represent the state you intend to keep — it is to let
you reach **any** earlier state. Exporting only after the correction means that
if you later find you corrected the wrong record, or wrote the wrong quantity,
the original value is gone from the database *and* from your machine. There is
no route back to it.

The pre-migration export is the rollback point for `--commit`. The
pre-correction export is the rollback point for your own edits. They protect
different mistakes and neither substitutes for the other.

> **This rule binds harder on Stage 2.** Its migration rewrites payment history
> — every `totalPaid` is folded into a synthetic opening entry and the original
> figure stops being the source of truth. A pre-change export is the *only*
> route back from that. Take one immediately before Stage 2's `--commit`, named
> `bomedia-rtdb-YYYY-MM-DD-pre-stage2.json`, and keep it after the migration
> looks fine — the failure mode there is a wrong figure that looks plausible,
> which you may not notice for weeks.

Console route:

1. Firebase console → **Realtime Database**.
2. Select the **bomedia-official** database (the one at
   `https://bomedia-official.firebaseio.com`).
3. Click the **⋮** menu at the top right of the data panel → **Export JSON**.
4. Save it somewhere outside this repo, dated:
   `~/backups/bomedia-rtdb-YYYY-MM-DD.json`.

CLI equivalent, if you have the Firebase CLI installed and authenticated:

```bash
npm install -g firebase-tools     # if needed
firebase login
# 1. before any correction
firebase database:get / --project bomedia-official \
  --output ~/backups/bomedia-rtdb-$(date +%F)-pre-correction.json

# 2. after correcting, before --commit
firebase database:get / --project bomedia-official \
  --output ~/backups/bomedia-rtdb-$(date +%F)-pre-migration.json
```

Confirm it is real before continuing:

```bash
ls -lh ~/backups/bomedia-rtdb-*.json    # neither is 0 bytes
head -c 200 ~/backups/bomedia-rtdb-2026-08-01-pre-correction.json
```

Keep both. Do not overwrite the pre-correction file with the pre-migration one —
that is the whole point of the distinct names.

---

## 4. Commit

```bash
npm run migrate:sales -- --commit
```

Runs in three phases, in this order, deliberately **not** as one atomic update:

1. **Copy** — write every new batch node.
2. **Verify** — read each one back and compare against what was planned,
   including that `subtotal + adjustments === totalAmount`.
3. **Delete** — only once every batch verifies, remove the old flat records.

If verification fails, it stops and **nothing is deleted** — every original is
still in place. Atomicity is not the property we want here; surviving originals
is.

---

## 5. Verify in the app

Open Records and a few transaction details. Check that migrated sales show the
right client, totals and item counts, and that the subtotal plus any adjustment
rows equals the total on screen.

### Concrete post-migration checks

Taken from the dry run of 2026-08-01 (8 legacy records -> 6 batches, delta ₦0).
These are specific expected values, not general assertions — if any differ, stop.

| Batch | Expect |
|---|---|
| `1784205859988` | 2 items, total **₦107,300**, **Paid** |
| `1784301143681` | 2 items, total **₦80,160**, **Paid**, due "August 1 2026", note "Thank you" |
| `-Oxdnea1Gezarkdnmn4_` | total ₦1,500, **Paid**, stage **Delivered** |
| `-Oxdnea42Yebjqc1oCj4` | total ₦30,000, **Paid**, stage **Delivered** |
| `-Oxdnea5YYawve4O3W9Y` | total ₦46,080, **Paid**, stage **Delivered** |
| `-OxdknkSYS_9ADlSCqug` | total ₦10,800,000, stage **Delivered**, status **Overpaid** — see below |

**Four of the six must read "Delivered" on the production board.** An earlier
version of the planner hardcoded `Queued` on the batch and let the real stage
fall through onto the item, which would have put already-delivered jobs back on
the board as not started. If any of those four shows Queued after migrating,
the fix regressed.

## 5b. Records to inspect before correcting

Do this **after** the pre-correction export, before changing anything. The
correct-vs-delete decision turns on what these show.

### `-OxdknkSYS_9ADlSCqug` — the ₦10.8m record

Check `clientName`. It currently reads `"new"` and `contact` is the developer's
own email. If that is a placeholder, this is test data, not a sale.

### Inspection result — 2026-08-01, read-only

| Client | Records | Total | `batchId` | Contact | Verdict |
|---|---:|---:|---|---|---|
| `new` | 1 | ₦10,800,000 | no | developer's own email | **test data** |
| `nw andn` | 3 | ₦77,580 | **no** | none | ambiguous — see below |
| `old school` | 2 | ₦107,300 | yes | none | looks genuine |
| `New ade` | 2 | ₦80,160 | yes | none | looks genuine |

**`new`** — placeholder name, developer's own email, `quantity: 10000`. All
three test signals agree.

**`nw andn`** — the three records were written **3 milliseconds apart**
(`07:22:59.115`, `.118`, `.118`) under one client name. That is a single
multi-item submit, not three sales. The amounts (₦1,500 / ₦30,000 / ₦46,080)
are irregular rather than round, which argues *against* fabrication. This is a
judgement about a real customer, and the data does not settle it.

> ⚠️ **Separate from the test-data question: these three carry no `batchId`, so
> the migration will split one order into THREE invoices.** The two genuine
> pairs group correctly because they do have one. If `nw andn` is a real order,
> give all three the same `batchId` in the console before migrating — any shared
> value works, the migration groups on it. If it is test data, delete all three
> and the question disappears.

### Which signals actually discriminated — read this before reusing them

Recorded so the same reasoning is not misapplied to future data.

**The irregular-amounts signal was a FALSE NEGATIVE.** ₦46,080, ₦62,500 and
₦20,160 look like considered prices, and that was read as evidence against
fabrication. It is not evidence of anything. Line totals are *computed* —
`quantity × unitPrice × area` — so they come out irregular no matter what is
typed into the form. A test entry and a real sale produce equally irregular
numbers. **Never treat the shape of a computed total as a signal about the
intent behind it.**

**Missing `contact` does not discriminate either.** It is absent on 7 of 8
records, including both genuine orders. What discriminated was the *presence*
of a specific value — the developer's own email — on exactly one record.

| Signal | Discriminating? | Why |
|---|---|---|
| `clientName` free text | **yes** | typed by a human, so it carries intent |
| `contact` = developer's own email | **yes** | 1/8, and unambiguous |
| `contact` absent | no | 7/8, including both genuine orders |
| `quantity` implausible (10000) | **yes** | typed, and physically absurd |
| Total is a round figure | no | computed |
| Total is an irregular figure | **no — false negative** | computed |
| Burst timestamps | no | a multi-item submit looks identical |

The rule that survives: **only free-text fields a human typed carry intent.**
Computed and generated values — totals, timestamps, push IDs — describe how the
record was written, not why.

---

## 5c. Documented correction — `-OxdknkSYS_9ADlSCqug`, 2026-08-01

Recorded so the ledger's history shows this figure was changed **deliberately**,
by a named person, for a stated reason — rather than a number that quietly moved
between two dry runs.

**Node:** `sales/-OxdknkSYS_9ADlSCqug`
**Corrected by:** Elijah, in the Firebase console
**Date:** 2026-08-01, before the legacy migration was committed

#### Values before correction

| Field | Value |
|---|---|
| `clientName` | `"new"` |
| `contact` | `elijahfasugba@gmail.com` |
| `createdAt` | `2026-07-16T07:10:30.294Z` |
| `material` | `Vinyl - Matte` |
| `width` × `height` | `2` × `3` ft → 6 sqft |
| `unitPrice` | `180` |
| `quantity` | **`10000`** |
| `total` | **`10800000`** |
| `amountPaid` | **`10900000`** |
| `productionStage` | `Delivered` |

#### Why it was corrected

1. **It was 97.6% of the entire ledger.** ₦10,800,000 of a ₦11,065,040 total,
   from one record. Every revenue, outstanding and net figure in the app was
   dominated by this single line.
2. **The total was arithmetically correct but the inputs were not.**
   6 sqft × ₦180 × 10,000 = ₦10,800,000 exactly — so this was never a
   stray-zeros error in `total`. The implausible field is `quantity: 10000`,
   ten thousand units of a 2×3ft banner.
3. **It carried the marks of a test entry** — a placeholder client name
   (`"new"`) and the developer's own email address as the contact.
4. **`amountPaid` exceeded `total` by a round ₦100,000**, so the batch derived
   to **Overpaid** — a status no genuine fully-settled sale should show.

#### Outcome — DELETED AS TEST DATA, all four

Decided by Elijah, 2026-08-01. Not corrected: no plausible quantity was invented
for a sale that never happened, because a corrected figure implies a real job
and a future reader could not tell the difference.

| Push key | Client | Total | Deleted |
|---|---|---:|---|
| `-OxdknkSYS_9ADlSCqug` | `new` | ₦10,800,000 | ✓ |
| `-Oxdnea1Gezarkdnmn4_` | `nw andn` | ₦1,500 | ✓ |
| `-Oxdnea42Yebjqc1oCj4` | `nw andn` | ₦30,000 | ✓ |
| `-Oxdnea5YYawve4O3W9Y` | `nw andn` | ₦46,080 | ✓ |

**Reason.** `new` carried a placeholder name, the developer's own email and
`quantity: 10000`. `nw andn` is `new` and-something typed fast in the same
session twelve minutes later (07:10:30 → 07:22:59) — a mistyped continuation of
the same test, not a customer name. The three were written 3ms apart under that
one name, so they were a single submit.

The `-OxdknkSYS_9ADlSCqug` values above are the pre-correction record required
by step 3's pre-correction export: `quantity 10000`, `total 10800000`,
`amountPaid 10900000`, overpaid by ₦100,000.

#### Expected after deletion — check the re-run dry run against this

| | Before | After |
|---|---:|---:|
| Legacy records | 8 | **4** |
| Batches | 6 | **2** |
| Ledger | ₦11,065,040 | **₦187,460** |

Both survivors are fully paid:

| Batch | Client | Total | Paid |
|---|---|---:|---:|
| `1784205859988` | `old school` | ₦107,300 | ₦107,300 |
| `1784301143681` | `New ade` | ₦80,160 | ₦80,160 |

Delta must still be **₦0** — every surviving total is already whole naira.

> If the re-run reports anything other than 4 records → 2 batches at ₦187,460,
> stop. Either a deletion did not take, or one removed more than intended.

**Ledger before:** ₦11,065,040 across 8 legacy records → 6 batches.
**Ledger after:** _record here._

> ⚠️ **The dry run MUST be re-run after any console edit.** The plan is computed
> from live data on every invocation — per-record totals, `grandTotalBefore`,
> `grandTotalAfter` and the delta are all read fresh. Committing against the
> figures above without re-running means committing against a plan nobody
> reviewed.

---

## 5a. Stage 2 gate — a concrete check, not a general assertion

Both multi-record batches are **fully paid today**:

| Batch | totalAmount | totalPaid |
|---|---|---|
| `1784205859988` | ₦107,300 | ₦107,300 |
| `1784301143681` | ₦80,160 | ₦80,160 |

Stage 2 converts `totalPaid` into a synthetic opening payment entry. **After
Stage 2's migration, both of these must still read Paid, immediately, with no
outstanding balance.**

> If either shows **Partial**, Stage 2's migration is wrong. Do not investigate
> the UI — the opening entry did not carry the full amount, and every other
> fully-paid invoice in the ledger is wrong the same way.

Check these two by name. They are the strongest available test because they are
multi-record: their `totalPaid` is the sum of two separate `amountPaid` values
(₦62,500 + ₦44,800, and ₦60,000 + ₦20,160), so an opening entry that takes only
one record's payment still looks plausible in isolation but fails here.

---

## 6. Delete the legacy shim

Once you are satisfied:

- `adaptLegacyRecords` and `isLegacyRecordNode` in `src/services/sales-repository.ts`
- the `adaptLegacyRecords` tests in `src/services/__tests__/sales-repository.test.ts`
- the legacy-fold branch in `parseSalesTree`

**Keep `deriveLegacyMoneyFields`** in `src/utils/money.ts`. It is a different
shim, covering batches written before `subtotal`/`adjustments[]` existed — the
migration now backfills those fields for the records it touches, but batches
already in the canonical layout still lack them until a separate backfill runs.

---

## 7. Delete the key

```bash
rm -rf secrets/
unset GOOGLE_APPLICATION_CREDENTIALS
```

Then revoke it in the console: **Project settings → Service accounts → Manage
service account permissions**.

---

## Re-running

Safe. The planner skips anything already in batch form, so a second run reports
zero legacy records and writes nothing. This is covered by tests in
`src/services/__tests__/legacy-sales-migration.test.ts` ("plans NOTHING on a
second pass", "a third pass is also a no-op").

---

## Do not overlap with Stage 2

Stage 2 converts `totalPaid` into append-only payment children and walks the
same nodes. Finish this migration, verify, and delete the shim **before**
starting it. Stage 2's own gate is stricter — it rewrites payment history, so
its export is the only way back.
