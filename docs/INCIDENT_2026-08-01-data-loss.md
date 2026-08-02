# Incident 2026-08-01 — two genuine orders deleted with the test data

**Status:** CLOSED — superseded by the wipe of 2026-08-01.

The rest of the sales tree was subsequently judged test data too, and the whole
database was wiped and restarted clean rather than migrated. `old school` and
`New ade` were not recovered; they went with everything else. The values below
remain the only record that those two orders existed.

**No pre-wipe export could be verified.** The user confirmed one was saved, but
it was not present under `~/Downloads`, `~/Desktop`, `~/Documents` or
`~/backups` at the time of the wipe. Recorded here as fact, not blame: if the
export does exist, these records are recoverable from it.

## What happened

Four legacy records were to be deleted as test data (`new` ×1, `nw andn` ×3).
**All eight legacy records were deleted instead.** The two genuine orders went
with them:

| Client | Records | Total | Paid | Balance |
|---|---:|---:|---:|---:|
| `old school` | 2 | ₦107,300 | ₦107,300 | ₦0 |
| `New ade` | 2 | ₦80,160 | ₦80,160 | ₦0 |
| | | **₦187,460** | **₦187,460** | **₦0** |

Detected by the re-run dry run, which reported `No legacy flat records found`
against an expected `4 legacy records → 2 batches, ₦187,460`. This is the stop
condition recorded in the runbook; the migration was halted and **not**
committed.

The 14 canonical batches (₦1,002,689) are untouched and intact.

## No pre-correction export was taken

The runbook's step 1 export was not made. Searched: `~/backups` (absent),
`~/Downloads`, the repo, and every JSON over 100KB modified in the last day
under the home directory. No database export exists.

## Recoverable values

Captured from read-only inspections earlier the same day. **This file is the
only remaining record of these values — do not delete it.**

### `old school` — batchId `1784205859988`, created 2026-07-16

| Field | Record A | Record B |
|---|---|---|
| push key | `-OxexCpyol-5MW37WzAQ` | `-OxexCq-ZzEYEHFSmBdq` |
| `total` | 62500 | 44800 |
| `amountPaid` | 62500 | 44800 |
| `createdAt` | `2026-07-16T12:44:19.989Z` | `2026-07-16T12:44:19.991Z` |
| `productionStage` | `Queued` | *(absent)* |
| `clientName` | `old school` | `old school` |
| `contact` | *(absent)* | *(absent)* |
| `dueDate` / `notes` | *(absent)* | *(absent)* |

### `New ade` — batchId `1784301143681`, created 2026-07-17

| Field | Record A | Record B |
|---|---|---|
| push key | `-OxkcgdcMbGUfJKIptD3` | `-Oxkcge0n2crldmBKSCY` |
| `total` | 60000 | 20160 |
| `amountPaid` | 60000 | 20160 |
| `createdAt` | `2026-07-17T15:12:23.699Z` | `2026-07-17T15:12:23.718Z` |
| `productionStage` | `Delivered` | *(absent)* |
| `clientName` | `New ade` | `New ade` |
| `contact` | *(absent)* | *(absent)* |
| `dueDate` | `August 1 2026` | `August 1 2026` |
| `notes` | `Thank you ` | `Thank you ` |

### Independent corroboration

`~/Downloads/bomedia_clients_export.csv` (app export, 2026-08-01 17:08):

```
"old school","2","107300","107300","0","16/07/2026"
"New ade","2","80160","80160","0","17/07/2026"
```

Client, job count, lifetime value, collected and balance all match.

## NOT recoverable

Per-line job specifications: `material`, `width`, `height`, `jobUnit`,
`quantity`, `unitPrice`, and each record's internal `id`.

These fields existed — they appear in the key-presence audit — but their values
for these four records were never printed, so they are gone. `~/Downloads/
bomedia_sales_export.csv` lists `old school` only as `"2 items"`, and `New ade`
postdates both CSV exports.

The money, client, dates, payments, status, due date, notes and production stage
are all known. **What was printed is not.**

## Options

1. **Firebase-side recovery.** Check Realtime Database → Backups in the console.
   Scheduled backups are a Blaze-plan feature; if one exists it restores
   everything including the job specs. Firebase support may also help within a
   retention window. **This is the only route that recovers the job details.**
2. **Reconstruct from this file.** Restores the money, client and dates exactly;
   leaves job specification fields blank or marked `unknown — reconstructed
   2026-08-01`. Every figure the ledger depends on is correct; the record of
   what was physically printed is not.
3. **Accept the loss.** The ledger under-reports by ₦187,460 and two paying
   customers have no history. Not recommended — both are fully-paid closed jobs,
   so the accounting impact is bounded, but the customer record is gone.

Try option 1 before option 2. A reconstruction is not reversible in the sense
that matters: once placeholder job details are written, a later real recovery
has to be reconciled against them.

## Why the runbook did not prevent it

It specified the pre-correction export as step 1 and gave the exact commands,
but the step was skipped and nothing enforced it. The deletion itself was
performed by hand in the console, where no tooling could check that four records
were removed rather than eight.

**Change for next time:** perform bulk deletions through a reviewed script that
takes an explicit list of push keys, refuses to run without a verified export,
and reports what it will delete before doing it — the same
dry-run/copy-verify-delete discipline the migration itself uses. The console is
fine for one field on one node; it is the wrong tool for removing eight records
by hand.

---

## The rule that came out of this

**Export twice. Before the change, and again after any correction but before the
migration. Name them distinctly and keep both.**

```bash
firebase database:get / --project bomedia-official \
  --output ~/backups/bomedia-rtdb-$(date +%F)-pre-correction.json

# …make the correction, verify it, then:

firebase database:get / --project bomedia-official \
  --output ~/backups/bomedia-rtdb-$(date +%F)-pre-migration.json
```

A backup's job is not to represent the state you intend to keep. It is to let
you reach **any** earlier state. One export taken after a correction cannot
recover the value you corrected away — which is precisely the loss recorded
above. The two files protect different mistakes and neither substitutes for the
other.

This binds hardest before anything that rewrites history rather than moving it.

## What changed as a result

Not a list of intentions — these are in the repository:

| Change | Where |
|---|---|
| Bulk deletions go through a reviewed script, never the console | `DATABASE_RUNBOOK.md`, "Bulk deletions go through a script" |
| That script proved the pattern: allow-list, protected nodes guarded twice, targets hardcoded rather than taken from argv, dry run by default, read-back verification after committing | recoverable via `git show 4c74502:scripts/wipe-test-data.ts` |
| The two-export rule above, with both filenames | `DATABASE_RUNBOOK.md` §Exports |
| A stop condition on every destructive run: expected record counts and totals stated in advance, compared before committing | `DATABASE_RUNBOOK.md` |
| Which signals actually identify test data — and that irregular amounts are a **false negative**, because computed totals are irregular whatever is typed | `DATABASE_RUNBOOK.md`, "Which signals actually discriminated" |
| Hard delete removed from the application entirely: `voidBatch`/`voidQuote` replace it, and the database rules block `remove()` on sales, quotes and payments for every client including admin | Stage 3, `database.rules.json` |

The last row is the one that matters most. The incident was a manual deletion,
but the same class of loss was reachable from inside the app — `deleteBatch`
called `remove()` on a financial record. That is now impossible to do by
accident, by mistake, or on purpose.

## What did not change

The stop condition worked. The re-run dry run reported `No legacy flat records
found` against an expected `4 legacy records → 2 batches, ₦187,460`, and the
migration halted without committing. Had it not, the loss would have been
compounded by a migration running against a tree it did not expect.

Detection was never the failure. The backup was.
