/**
 * Expo's ambient types, in a file that is actually committed.
 *
 * `expo-env.d.ts` contains exactly this reference, and Expo generates it on
 * `expo start` — then gitignores it, on the assumption that everyone who
 * typechecks has just run the dev server. CI has not: it does a clean checkout
 * and runs `npx tsc --noEmit`, so the reference was simply absent and the
 * typecheck failed on things that pass on every developer machine:
 *
 *   - `Cannot find module './animated-icon.module.css'` and `@/global.css`
 *   - `StyleSheet.create` rejecting `transitionDuration`, `transitionProperty`,
 *     `outlineWidth` and `boxShadow` — the react-native-web style properties
 *     the web chrome relies on
 *
 * Committing the reference rather than the generated file leaves Expo free to
 * regenerate `expo-env.d.ts` whenever it likes; a duplicate reference directive
 * costs nothing.
 */

/// <reference types="expo/types" />
