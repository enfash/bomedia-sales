import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Session preferences persisted to AsyncStorage (works on web + native) so the
 * "keep me signed in" choice and the idle timer survive a full app close — the
 * timeout can't live only in memory or it wouldn't apply after a cold launch.
 */
// Exported so src/lib/auth.ts (web) can seed its storage choice by reading
// this same key straight off window.localStorage — see the note there on why
// that has to happen synchronously, before this module's own async getter
// could return.
export const KEEP_KEY = 'bomedia:auth:keepSignedIn';
const LAST_ACTIVE_KEY = 'bomedia:auth:lastActiveAt';

/** Auto sign-out after this much inactivity (keep-me-signed-in sessions). */
export const IDLE_LIMIT_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Defaults to true (checkbox is checked by default). */
export async function getKeepSignedIn(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEEP_KEY);
  return v == null ? true : v === 'true';
}

export async function setKeepSignedIn(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEEP_KEY, value ? 'true' : 'false');
}

export async function getLastActiveAt(): Promise<number | null> {
  const v = await AsyncStorage.getItem(LAST_ACTIVE_KEY);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function setLastActiveAt(ts: number): Promise<void> {
  await AsyncStorage.setItem(LAST_ACTIVE_KEY, String(ts));
}

export async function clearSessionKeys(): Promise<void> {
  await AsyncStorage.multiRemove([KEEP_KEY, LAST_ACTIVE_KEY]);
}

/** True when a keep-me-signed-in session has been idle past the 48h limit. */
export function isExpired(lastActive: number | null, now: number = Date.now()): boolean {
  return lastActive != null && now - lastActive > IDLE_LIMIT_MS;
}
