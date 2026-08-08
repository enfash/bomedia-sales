/**
 * Who a sale belongs to, when the only thing recorded was a typed name.
 *
 * `clientName` is free text, so `Blessing Prints`, `blessing prints` and
 * `Blessing  Prints` are three customers with three separate balances, and the
 * debtors view under-reports what is owed. This module is the identity rule
 * that stops that: one normalised form per person, computed here and nowhere
 * else.
 *
 * THE GUARANTEE LIVES HERE, NOT IN THE RULES. RTDB's rules language has no
 * lowercase and no way to derive one field from another, so
 * `normalizedName === normalizeClientName(name)` is not expressible as a
 * security rule. The rules check the SHAPE of the normalised form — a string,
 * non-empty, `^[a-z0-9]+$` — which catches the realistic mistake of writing the
 * display name into the normalised field. The relationship between the two is
 * held by this function being the only writer's only source. Do not add a rule
 * that appears to enforce more than that.
 */

/** Longest accepted name, matching the `.validate` bound on both fields. */
export const MAX_CLIENT_NAME = 120;

/**
 * The dedupe key for a client name.
 *
 * Lowercased, with everything that is not a letter or digit removed — so case,
 * spacing, punctuation and `&`/`and` spacing differences all collapse. Returns
 * an empty string for input that carries no identity at all, which callers must
 * treat as "no client", never as a client whose key is empty.
 */
export function normalizeClientName(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining marks, so `Adéṣínà` and `Adesina` are the same customer.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Is this a usable client name? Empty and whitespace-only are not. */
export function isUsableClientName(name: string | null | undefined): boolean {
  return normalizeClientName(name).length > 0;
}

/** What the rules will accept in `normalizedName`, mirrored for tests. */
export function isValidNormalizedForm(value: string): boolean {
  return value.length > 0 && value.length <= MAX_CLIENT_NAME && /^[a-z0-9]+$/.test(value);
}

interface ClientLike {
  id: string;
  normalizedName: string;
}

interface SaleLike {
  clientId?: string;
  clientName?: string;
}

/**
 * Does this sale belong to this client?
 *
 * TWO WAYS, PERMANENTLY. A sale written since Stage 6 carries `clientId` and
 * joins on it. A sale written before does not, and joins on the normalised
 * name — and that fallback is not transitional. A sale from before this stage
 * must never disappear from a customer's history because of a field it
 * predates, and no migration rewrites those records to add one.
 *
 * `clientId` wins when present: it survives a rename, which is the entire point
 * of having it.
 */
export function saleBelongsToClient(sale: SaleLike, client: ClientLike): boolean {
  if (sale.clientId) return sale.clientId === client.id;

  const key = normalizeClientName(sale.clientName);
  return key.length > 0 && key === client.normalizedName;
}

/**
 * Group sales by client, keeping the unmatched ones visible.
 *
 * Anything that matches no client — a name typed before its client record
 * existed, or one nobody has seeded — comes back under `unmatched` rather than
 * being dropped. A customer silently missing from a debtors list is the failure
 * this stage exists to remove, so it must not be reintroduced by the grouping.
 */
export function groupSalesByClient<S extends SaleLike, C extends ClientLike>(
  sales: S[],
  clients: C[],
): { byClient: Map<string, S[]>; unmatched: S[] } {
  const byClient = new Map<string, S[]>();
  const unmatched: S[] = [];

  for (const client of clients) byClient.set(client.id, []);

  for (const sale of sales) {
    const owner = clients.find((c) => saleBelongsToClient(sale, c));
    if (owner) byClient.get(owner.id)!.push(sale);
    else unmatched.push(sale);
  }

  return { byClient, unmatched };
}
