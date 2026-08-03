/**
 * The attribution chain.
 *
 * Every sale, payment, void and activity entry is signed with whatever this
 * returns, so the order is a decision about who a record says is answerable for
 * it — not a display preference. `users/{uid}.name` wins because it is the only
 * name settable from inside the app and the only one visible to a security
 * rule or a query; Auth's `displayName` sits BELOW it deliberately, so that
 * setting a name there can never quietly become the source of truth.
 */

import { actorFrom } from '@/services/activity';

// `activity.ts` pulls in `db.ts` → the Firebase ESM bundle, which jest-expo does
// not transform. Every other service test stubs it the same way; `actorFrom` is
// pure and touches none of it.
jest.mock('@/services/db', () => ({ dbService: {} }));

const user = { uid: 'uid-office', displayName: 'Display Name', email: 'bomedia03@gmail.com' };

describe('actorFrom', () => {
  it('prefers the profile name over everything', () => {
    expect(actorFrom(user, 'Office').name).toBe('Office');
  });

  it('falls back to displayName when there is no profile name', () => {
    expect(actorFrom(user, null).name).toBe('Display Name');
    expect(actorFrom(user, undefined).name).toBe('Display Name');
  });

  it('treats a blank or whitespace profile name as absent', () => {
    expect(actorFrom(user, '').name).toBe('Display Name');
    expect(actorFrom(user, '   ').name).toBe('Display Name');
  });

  it('falls back to email when Auth carries no display name', () => {
    expect(actorFrom({ ...user, displayName: null }, null).name).toBe('bomedia03@gmail.com');
  });

  it('falls back to the uid rather than to nothing', () => {
    // Unreadable, but it identifies exactly one person and resolves later.
    expect(actorFrom({ uid: 'uid-office' }, null).name).toBe('uid-office');
  });

  it('is never blank, even with nothing to go on', () => {
    expect(actorFrom(null).name).not.toBe('');
    expect(actorFrom(undefined).name).not.toBe('');
    expect(actorFrom({ uid: '' }, null).name).not.toBe('');
  });

  it('always carries the uid the name is meant to identify', () => {
    // A name with no uid displays correctly and filters as nobody — it is a
    // label wearing an attribution's clothes.
    expect(actorFrom(user, 'Office').uid).toBe('uid-office');
  });
});
