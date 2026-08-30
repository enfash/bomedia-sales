/**
 * `describeWriteError`'s PERMISSION_DENIED branch has to tell two causes
 * apart that look identical in the raw error: a genuine role denial, vs.
 * mint-firebase-token's bridge never establishing a Firebase Auth session
 * (see supabase/README.md → "Firebase Auth bridge"). Wording the second
 * case as "your account doesn't have permission" sends the operator to ask
 * about the wrong thing.
 */

import { auth as mockedFirebaseAuth } from '@/lib/firebase';
import { describeWriteError } from '@/utils/errors';

jest.mock('@/lib/firebase', () => ({ auth: { currentUser: null } }));

function setFirebaseUser(user: { uid: string } | null) {
  (mockedFirebaseAuth as unknown as { currentUser: { uid: string } | null }).currentUser = user;
}

beforeEach(() => {
  setFirebaseUser(null);
});

describe('describeWriteError — PERMISSION_DENIED', () => {
  it('blames the bridge, not the operator, when no Firebase Auth session exists', () => {
    const message = describeWriteError(new Error('PERMISSION_DENIED: Permission denied'), 'record this sale');
    expect(message.title).toBe('Could not record this sale');
    expect(message.body).not.toMatch(/permission|role/i);
    expect(message.body).toMatch(/connection|try again/i);
  });

  it('blames the account when a real Firebase Auth session exists and is still denied', () => {
    setFirebaseUser({ uid: 'firebase-uid-1' });
    const message = describeWriteError(new Error('PERMISSION_DENIED: Permission denied'), 'record this sale');
    expect(message.title).toBe('Not allowed to record this sale');
    expect(message.body).toMatch(/permission|role/i);
  });

  it('recognises the Postgres RLS equivalent (42501) the same way', () => {
    setFirebaseUser({ uid: 'firebase-uid-1' });
    const message = describeWriteError({ code: '42501', message: 'row-level security policy violation' }, 'record this payment');
    expect(message.title).toBe('Not allowed to record this payment');
  });
});
