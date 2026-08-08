/**
 * The identity rule, and the join that must not lose history.
 *
 * Two failures are being designed against. One: the same customer counted
 * twice, which under-reports what is owed. Two — worse, because it is silent —
 * a sale that stops appearing under its customer because it predates
 * `clientId`. The second is why the name fallback is permanent rather than a
 * migration step.
 */

import {
  MAX_CLIENT_NAME,
  groupSalesByClient,
  isUsableClientName,
  isValidNormalizedForm,
  normalizeClientName,
  saleBelongsToClient,
} from '@/services/client-identity';

describe('normalizeClientName — one key per person', () => {
  it('collapses the case difference that made two customers of one', () => {
    expect(normalizeClientName('Blessing Prints')).toBe(normalizeClientName('blessing prints'));
  });

  it('collapses spacing and punctuation', () => {
    const forms = ['Blessing Prints', 'Blessing  Prints', 'Blessing-Prints', 'BlessingPrints', ' Blessing Prints '];
    expect(new Set(forms.map(normalizeClientName)).size).toBe(1);
  });

  it('collapses accents, so a name typed either way is one customer', () => {
    expect(normalizeClientName('Adéṣínà')).toBe(normalizeClientName('Adesina'));
  });

  it('keeps digits, which are part of real shop names', () => {
    expect(normalizeClientName('A1 Signage')).toBe('a1signage');
  });

  it('does NOT collapse genuinely different names', () => {
    // The pair sitting in the live data. A machine cannot know whether these
    // are one person, so it must not decide.
    expect(normalizeClientName('Eli')).not.toBe(normalizeClientName('Elijah'));
  });

  it('returns empty for input carrying no identity', () => {
    expect(normalizeClientName('')).toBe('');
    expect(normalizeClientName('   ')).toBe('');
    expect(normalizeClientName('!!!')).toBe('');
    expect(normalizeClientName(null)).toBe('');
    expect(normalizeClientName(undefined)).toBe('');
  });
});

describe('isUsableClientName', () => {
  it('rejects what normalises to nothing', () => {
    expect(isUsableClientName('  ')).toBe(false);
    expect(isUsableClientName('---')).toBe(false);
    expect(isUsableClientName(undefined)).toBe(false);
  });

  it('accepts a real name', () => {
    expect(isUsableClientName('Mr ade')).toBe(true);
  });
});

describe('isValidNormalizedForm — what the rules will accept', () => {
  it('accepts the output of the normaliser', () => {
    for (const name of ['Blessing Prints', 'A1 Signage', 'Mr ade', 'Adéṣínà']) {
      expect(isValidNormalizedForm(normalizeClientName(name))).toBe(true);
    }
  });

  it('rejects a display name written into the normalised field', () => {
    // The realistic mistake, and the one the rule can genuinely catch.
    expect(isValidNormalizedForm('Blessing Prints')).toBe(false);
  });

  it('rejects empty and over-long values', () => {
    expect(isValidNormalizedForm('')).toBe(false);
    expect(isValidNormalizedForm('a'.repeat(MAX_CLIENT_NAME + 1))).toBe(false);
  });
});

describe('saleBelongsToClient — clientId wins, the name is the fallback', () => {
  const client = { id: 'c1', normalizedName: 'blessingprints' };

  it('joins on clientId when the sale has one', () => {
    expect(saleBelongsToClient({ clientId: 'c1', clientName: 'anything at all' }, client)).toBe(true);
  });

  it('trusts clientId OVER the name, so a rename does not detach history', () => {
    // The customer was renamed after this sale; the snapshot still says the old
    // name. The id is what survives that, which is the point of having it.
    expect(saleBelongsToClient({ clientId: 'c1', clientName: 'Old Name' }, client)).toBe(true);
    expect(saleBelongsToClient({ clientId: 'c2', clientName: 'Blessing Prints' }, client)).toBe(false);
  });

  it('falls back to the normalised name for a sale written before clientId', () => {
    expect(saleBelongsToClient({ clientName: 'blessing prints' }, client)).toBe(true);
    expect(saleBelongsToClient({ clientName: 'Blessing Prints' }, client)).toBe(true);
  });

  it('does not match an unnamed sale to a client', () => {
    expect(saleBelongsToClient({ clientName: '' }, client)).toBe(false);
    expect(saleBelongsToClient({}, client)).toBe(false);
    // Nor to a client whose own key is somehow empty.
    expect(saleBelongsToClient({ clientName: '' }, { id: 'c9', normalizedName: '' })).toBe(false);
  });
});

describe('groupSalesByClient — history is never quietly dropped', () => {
  const clients = [
    { id: 'c1', normalizedName: 'blessingprints' },
    { id: 'c2', normalizedName: 'mrade' },
  ];

  it('keeps pre-clientId sales attached to their client', () => {
    const sales = [
      { clientId: 'c1', clientName: 'Blessing Prints' }, // new
      { clientName: 'blessing prints' }, // old, no clientId
      { clientName: 'Mr ade' },
    ];
    const { byClient, unmatched } = groupSalesByClient(sales, clients);

    expect(byClient.get('c1')).toHaveLength(2);
    expect(byClient.get('c2')).toHaveLength(1);
    expect(unmatched).toEqual([]);
  });

  it('surfaces a sale matching NO client instead of losing it', () => {
    // A name typed before anyone seeded a record for it. Dropping it is exactly
    // the silent under-reporting this stage exists to end.
    const sales = [{ clientName: 'Somebody New' }];
    const { byClient, unmatched } = groupSalesByClient(sales, clients);

    expect(unmatched).toHaveLength(1);
    expect([...byClient.values()].flat()).toEqual([]);
  });

  it('gives every known client an entry, even with no sales', () => {
    const { byClient } = groupSalesByClient([], clients);
    expect(byClient.get('c1')).toEqual([]);
    expect(byClient.get('c2')).toEqual([]);
  });
});
