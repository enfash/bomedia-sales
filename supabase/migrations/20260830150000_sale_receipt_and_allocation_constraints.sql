-- ============================================================================
-- receipt_number + allocation uniqueness — db.ts port, slice 5 prerequisite
-- ============================================================================
-- receipt_number: the human-readable, client-generated key create_sale's
-- offline-queue replay safety is built on (see the RPC migration). Client
-- must know it before the write is issued, so it can never be a server
-- default — same reasoning as every other client-generated key in this
-- schema. NOT NULL directly, not backfilled: this table has no real rows
-- yet (pre-launch).
alter table sales add column receipt_number text not null unique;

-- unique(payment_batch_id, sale_id): the backstop record_payment's replay
-- logic depends on being real, not assumed. A batch existing does not by
-- itself prove its allocation exists — only batches record_payment itself
-- created can assume that; a batch written by the Sheets import or an admin
-- correction has no such guarantee. record_payment therefore always
-- attempts the allocation insert and relies on this constraint (via
-- ON CONFLICT DO NOTHING) to make a second attempt a no-op rather than a
-- second allocation.
alter table payment_allocations add constraint payment_allocations_batch_sale_unique
  unique (payment_batch_id, sale_id);
