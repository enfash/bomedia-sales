import { dbService } from '@/services/db';
import type { IncrementMarker, OutboxOp } from '@/services/outbox';

/**
 * The parts of the outbox that touch Firebase, kept apart from the replay logic
 * so that logic — and everything importing it for the age cap — can be tested
 * without pulling in the SDK.
 */

function isIncrement(value: unknown): value is IncrementMarker {
  return Boolean(value) && typeof value === 'object' && typeof (value as any).__increment === 'number';
}

/** Rebuild SDK sentinels from their stored markers. */
export function materialise<T extends Record<string, unknown>>(updates: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(updates)) {
    out[path] = isIncrement(value) ? dbService.increment(value.__increment) : value;
  }
  return out;
}

/** Sends one op for real. Injected into `replayMissing` as its `send`. */
export function sendOp(op: OutboxOp): Promise<void> {
  if (op.kind === 'set') return dbService.setRecord(op.path, op.value);
  return dbService.updateAtomic(materialise(op.updates));
}
