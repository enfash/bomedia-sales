import { useSyncExternalStore } from 'react';

/** Table row density — a web power-user preference, persisted across sessions. */
export type Density = 'comfortable' | 'compact';

const KEY = 'bomedia:density';
const listeners = new Set<() => void>();

function read(): Density {
  if (typeof localStorage === 'undefined') return 'comfortable';
  return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'comfortable';
}

let current: Density = read();

function emit() {
  listeners.forEach((l) => l());
}

export function setDensity(d: Density) {
  current = d;
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, d);
  emit();
}

export function toggleDensity() {
  setDensity(current === 'compact' ? 'comfortable' : 'compact');
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Subscribe to the current table density. */
export function useDensity(): Density {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => 'comfortable' as Density,
  );
}
