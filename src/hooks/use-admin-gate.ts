import { useAuth } from '@/context/auth-context';

/**
 * Three-state answer to "may this person see the admin surface?".
 *
 * `isAdmin` alone cannot express it. The role is a second, slower round trip
 * than the auth check — `AuthGate` opens as soon as Firebase reports a user,
 * while the `users/{uid}` read that carries the role is still in flight (see
 * auth-context). For that second or two `role` is null, so `isAdmin` is false
 * and a screen gated on it renders its "Admins only" refusal at a real admin,
 * then swaps to the true page when the read lands.
 *
 * `role === null` is not "not an admin", it is "not known yet", and the two
 * deserve different UI: a loading state, not a refusal.
 */
export type AdminGate = 'pending' | 'denied' | 'allowed';

export function useAdminGate(): AdminGate {
  const { role } = useAuth();

  if (role === null) return 'pending';
  return role === 'admin' ? 'allowed' : 'denied';
}
