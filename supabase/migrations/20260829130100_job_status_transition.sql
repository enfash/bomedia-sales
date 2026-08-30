-- ============================================================================
-- job_status transition guard
-- ============================================================================
-- Permissive on purpose: reprints and reordering happen on the shop floor
-- constantly, and a strict forward-only (or any other) state machine would
-- block real work for no benefit. The one transition that must never happen
-- is leaving 'Delivered' — a job that's gone out the door doesn't become
-- un-delivered by dragging it back to an earlier column; a genuine reprint
-- after delivery is a new sale, not this one un-completing itself. Every
-- other move, including sideways and backwards among the other four stages,
-- is allowed.
--
-- Not gated by is_admin() — this is a state-machine rule, not an RBAC rule.
-- sales_staff_update_guard (20260829120300) already governs who may change
-- job_status at all; this governs which changes are legal regardless of who
-- makes them.
create function public.enforce_job_status_transition()
returns trigger
language plpgsql
as $$
begin
  if old.job_status = 'Delivered' and new.job_status <> 'Delivered' then
    raise exception 'a sale cannot move backwards out of Delivered (tried % -> %)',
      old.job_status, new.job_status;
  end if;
  return new;
end;
$$;

create trigger enforce_job_status_transition
before update of job_status on sales
for each row execute function public.enforce_job_status_transition();
