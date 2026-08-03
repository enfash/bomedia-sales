/**
 * The failure mapping of the check that decides whether money is missing.
 *
 * `missing` is the only verdict that sends the operator to re-enter a payment
 * by hand. Every other outcome must therefore be `unverified` — an expired
 * token that mapped to `missing` would report EVERY pending write as lost and
 * ask them to re-enter money that is already in the ledger.
 */

import { checkExistsOnServer, type Fetcher } from '@/services/existence-check';

const respond = (status: number, body: string, ok = status >= 200 && status < 300): Fetcher =>
  async () => ({ ok, status, text: async () => body });

const deps = (fetcher: Fetcher, token: string | null = 'id-token') => ({
  databaseUrl: 'https://bomedia-official.firebaseio.com',
  getToken: async () => token,
  fetcher,
});

describe('what it sends', () => {
  it('reads the node shallowly, over REST, as the signed-in user', async () => {
    const seen: string[] = [];
    const fetcher: Fetcher = async (url) => {
      seen.push(url);
      return { ok: true, status: 200, text: async () => 'true' };
    };

    await checkExistsOnServer('payments/2026-08-03/uid-a/-K1', deps(fetcher));

    expect(seen[0]).toBe(
      'https://bomedia-official.firebaseio.com/payments/2026-08-03/uid-a/-K1.json' +
        '?shallow=true&auth=id-token',
    );
  });

  it('tolerates a leading slash on the path', async () => {
    const seen: string[] = [];
    const fetcher: Fetcher = async (url) => {
      seen.push(url);
      return { ok: true, status: 200, text: async () => 'true' };
    };
    await checkExistsOnServer('/sales/2026/08/03/INV-X', deps(fetcher));
    expect(seen[0]).toContain('/sales/2026/08/03/INV-X.json');
  });
});

describe('404 is NOT how a missing node answers', () => {
  it('maps 200 + null to missing — the only verdict that means lost', async () => {
    expect(await checkExistsOnServer('p', deps(respond(200, 'null')))).toBe(false);
  });

  it('maps 200 + a value to landed', async () => {
    expect(await checkExistsOnServer('p', deps(respond(200, 'true')))).toBe(true);
    expect(await checkExistsOnServer('p', deps(respond(200, '{"amount":5000}')))).toBe(true);
    expect(await checkExistsOnServer('p', deps(respond(200, '0')))).toBe(true);
    expect(await checkExistsOnServer('p', deps(respond(200, '""')))).toBe(true);
  });

  it('maps 404 to UNVERIFIED — it means no such database, not no such node', async () => {
    // RTDB answers a nonexistent path with 200 null. A 404 is the wrong
    // instance or a wrong URL, which given this project's history is a
    // configuration error rather than an answer about the write.
    expect(await checkExistsOnServer('p', deps(respond(404, 'null', false)))).toBeNull();
  });
});

describe('every other outcome is unverified', () => {
  it('401 — an expired token must never report money as lost', async () => {
    expect(await checkExistsOnServer('p', deps(respond(401, 'Permission denied', false)))).toBeNull();
  });

  it('403 — the rules refusing a read says nothing about the node', async () => {
    expect(await checkExistsOnServer('p', deps(respond(403, 'Permission denied', false)))).toBeNull();
  });

  it('500 — the server could not answer', async () => {
    expect(await checkExistsOnServer('p', deps(respond(500, 'oops', false)))).toBeNull();
  });

  it('network failure — offline is not evidence', async () => {
    const fetcher: Fetcher = async () => {
      throw new TypeError('Network request failed');
    };
    expect(await checkExistsOnServer('p', deps(fetcher))).toBeNull();
  });

  it('a 200 carrying HTML — a captive portal is not the database', async () => {
    // The dangerous one: hotel or public wifi answers every request with a
    // login page. Read as "something is there", it would clear the journal
    // entry for a payment that never landed.
    const html = '<!DOCTYPE html><html><body>Sign in to continue</body></html>';
    expect(await checkExistsOnServer('p', deps(respond(200, html)))).toBeNull();
  });

  it('an empty 200 is not an answer', async () => {
    expect(await checkExistsOnServer('p', deps(respond(200, '')))).toBeNull();
  });

  it('malformed JSON', async () => {
    expect(await checkExistsOnServer('p', deps(respond(200, '{"amount":')))).toBeNull();
  });

  it('no signed-in user — the read would be refused anyway', async () => {
    const fetcher: Fetcher = async () => {
      throw new Error('should not be called');
    };
    expect(await checkExistsOnServer('p', deps(fetcher, null))).toBeNull();
  });

  it('a token refresh that throws', async () => {
    const result = await checkExistsOnServer('p', {
      databaseUrl: 'https://x.firebaseio.com',
      getToken: async () => {
        throw new Error('token refresh failed');
      },
      fetcher: respond(200, 'true'),
    });
    expect(result).toBeNull();
  });
});

describe('a hung request does not stall reconciliation', () => {
  it('gives up and answers unverified', async () => {
    const fetcher: Fetcher = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });

    const result = await checkExistsOnServer('p', {
      ...deps(fetcher),
      timeoutMs: 10,
    });
    expect(result).toBeNull();
  });
});
