# Migration runbook — legacy flat sales records

Do these in order. Do not skip step 3.

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

## 3. Take a full database export — REQUIRED

Do not run `--commit` without this. Console route:

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
firebase database:get / \
  --project bomedia-official \
  --output ~/backups/bomedia-rtdb-$(date +%F).json
```

Confirm it is real before continuing:

```bash
ls -lh ~/backups/bomedia-rtdb-$(date +%F).json   # not 0 bytes
head -c 200 ~/backups/bomedia-rtdb-$(date +%F).json
```

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

### Documented correction — `-OxdknkSYS_9ADlSCqug`, 2026-08-01

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

#### Values after correction

> Fill in once the console edit is made, then re-run the dry run and paste the
> new grand total here. If the node was deleted rather than corrected, say so
> and record the resulting record/batch counts.

| Field | Value |
|---|---|
| `quantity` | |
| `total` | |
| `amountPaid` | |

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
