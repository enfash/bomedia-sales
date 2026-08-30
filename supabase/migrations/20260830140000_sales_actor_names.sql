-- ============================================================================
-- sales actor-name snapshots — db.ts port, slice 4
-- ============================================================================
-- Same decision as expenses.logged_by_name (20260830110000): a financial
-- record must keep saying who did something at the time, not who they're
-- called now. Pulled forward from slice 5 into slice 4 because slice 4's own
-- read-side proof needs somewhere to read loggedByName/voidedByName from —
-- the columns have to exist before the read function can be proven against
-- them, even though nothing writes to `sales` for real until slice 5.
-- `payment_batches.collected_by_name` stays in slice 5: nothing in
-- SalesBatch's shape needs it, so there's no reason to add it early.
alter table sales add column logged_by_name text not null default '';
alter table sales alter column logged_by_name drop default;

alter table sales add column voided_by_name text;

alter table sales drop constraint sales_void_fields_consistent;
alter table sales add constraint sales_void_fields_consistent check (
  (is_voided = false and voided_at is null and voided_by is null and voided_by_name is null and void_reason is null)
  or
  (is_voided = true and voided_at is not null and voided_by is not null and voided_by_name is not null and void_reason is not null)
);
