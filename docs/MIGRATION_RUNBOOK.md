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
