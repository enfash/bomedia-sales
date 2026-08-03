import { dbService } from '@/services/db';
import { useEffect, useState } from 'react';

/**
 * Whether Firebase currently holds a socket to the backend.
 *
 * CONTEXT ONLY. A `true` here is not evidence that anything reached the server
 * — the socket reads connected through a dead uplink and through a captive
 * portal — so no copy may use it to reassure, and no control may gate on it.
 * The pending journal is the authority on whether a write landed; this is for
 * interpreting what the journal says, not for replacing it.
 *
 * Starts `true`, so the app never opens by announcing a problem it has not
 * detected yet.
 */
export function useConnection(): boolean {
  const [connected, setConnected] = useState(true);

  useEffect(() => dbService.subscribeConnection(setConnected), []);

  return connected;
}
