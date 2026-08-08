import { useCallback, useRef, useState } from 'react';

import {
  awaitConfirmation,
  isUnconfirmed,
  type ConfirmOutcome,
  type ConfirmResult,
} from '@/services/confirm-window';
import { dbService } from '@/services/db';

/**
 * What a money write's submit button does while it waits, and what it says
 * when the wait ends without an answer.
 *
 * The countdown is the point. The failure being designed against is the
 * operator tapping submit again, and that comes from not knowing whether
 * anything is happening — so the button shows the wait ending rather than an
 * indefinite spinner.
 */
export interface ConfirmState {
  /** Whole seconds left, or null when nothing is in flight. */
  secondsLeft: number | null;
  waiting: boolean;
}

/**
 * The message for an outcome that is neither saved nor failed.
 *
 * PAPER FIRST, UNCONDITIONALLY. The retry is mentioned second and hedged,
 * because it is only true if the journal entry was written and the app is
 * reopened on this device. Put the retry first and it reads as a reason to skip
 * the paper note, which is the one instruction that always holds.
 */
export const UNCONFIRMED_MESSAGE =
  'Write it on paper now — this may not have saved. If it did not, the app will try again next time you open it.';

export function useConfirmWindow() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(async <T,>(work: Promise<T>): Promise<ConfirmResult<T>> => {
    inFlight.current = true;
    try {
      return await awaitConfirmation(work, {
        onTick: setSecondsLeft,
        // Subscribing reports the CURRENT socket state first, so an already
        // offline device answers at once instead of counting down at someone.
        onDisconnect: (notify) =>
          dbService.subscribeConnection((connected) => {
            if (!connected) notify();
          }),
      });
    } finally {
      inFlight.current = false;
      setSecondsLeft(null);
    }
  }, []);

  return {
    secondsLeft,
    waiting: secondsLeft !== null,
    run,
    isUnconfirmed,
  };
}

export type { ConfirmOutcome };
