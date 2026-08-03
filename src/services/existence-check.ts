/**
 * "Did this write reach the server?" — the read the pending-write journal
 * depends on, isolated from Firebase so its failure mapping can be tested.
 *
 * WHAT IT SENDS
 *
 *   GET {databaseUrl}/{path}.json?shallow=true&auth={idToken}
 *
 * A plain REST read against the Realtime Database, authenticated with the
 * signed-in user's ID token. It deliberately does NOT go through the SDK:
 * `get()` is served from an in-memory cache that still holds the local echo of
 * a write that never reached the server, so it would report a lost payment as
 * present and clear the journal entry protecting it. REST cannot be answered by
 * that cache, whenever it is called.
 *
 * `shallow=true` returns `true` for a node with children rather than
 * downloading it — this asks whether something is there, not what.
 *
 * Rules apply: it reads as the user, not as an owner.
 *
 * WHAT THE ANSWERS MEAN
 *
 * | outcome                        | verdict      | why |
 * |--------------------------------|--------------|-----|
 * | 200, body `null`               | **missing**  | RTDB's answer for "no such node". The ONLY thing that means the write is not there. |
 * | 200, any other JSON            | landed       | something is at that path |
 * | 200, body that is not JSON     | unverified   | a captive portal / proxy answering with an HTML page. NOT proof of anything. |
 * | 401 (expired or invalid token) | unverified   | says nothing about the node |
 * | 403 (rules refused the read)   | unverified   | says nothing about the node |
 * | 404 (no such DATABASE)         | unverified   | wrong instance or URL — not a missing node |
 * | 5xx                            | unverified   | the server could not answer |
 * | network failure / timeout      | unverified   | offline is not evidence |
 *
 * The asymmetry is the whole point. `missing` sends the operator to re-enter
 * money by hand; every other outcome must therefore be `unverified`, because a
 * merely expired token would otherwise report EVERY pending write as lost and
 * ask them to re-enter money that is already in the ledger.
 *
 * Note 404 does not mean "missing node" here: RTDB answers a nonexistent path
 * with `200 null`. A 404 means the database itself was not found, which given
 * this project's history — rules deployed to the wrong instance for months —
 * is a configuration error, not an answer.
 */

export interface ExistenceResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<ExistenceResponse>;

export interface ExistenceCheckDeps {
  databaseUrl: string;
  /** Resolves the caller's ID token, or null when there is no signed-in user. */
  getToken: () => Promise<string | null>;
  fetcher: Fetcher;
  /** A hung request must not stall reconciliation forever. */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

/** `true` = landed, `false` = missing, `null` = could not tell. */
export async function checkExistsOnServer(
  path: string,
  deps: ExistenceCheckDeps,
): Promise<boolean | null> {
  const { databaseUrl, getToken, fetcher, timeoutMs = DEFAULT_TIMEOUT_MS } = deps;

  let token: string | null = null;
  try {
    token = await getToken();
  } catch {
    return null; // token refresh failed — offline, or the session went away
  }
  // No token means the read would be unauthenticated, and the rules would
  // refuse it. That is not evidence the write is missing.
  if (!token) return null;

  const clean = path.replace(/^\/+/, '');
  const url = `${databaseUrl}/${clean}.json?shallow=true&auth=${encodeURIComponent(token)}`;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const response = await fetcher(url, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) return null; // 401, 403, 404, 5xx — all "could not tell"

    const body = (await response.text()).trim();
    if (body === '') return null; // an empty 200 is not an answer

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      // A 200 carrying HTML is a captive portal or a proxy, not the database.
      // Treating it as "something is there" would clear the journal entry for a
      // payment that never landed — the exact silent loss this guards.
      return null;
    }

    return parsed !== null;
  } catch {
    return null; // network failure, DNS, abort
  } finally {
    if (timer) clearTimeout(timer);
  }
}
