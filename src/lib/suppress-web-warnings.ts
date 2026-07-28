import { Platform } from 'react-native';

/**
 * react-native-paper animates several components (Modal, ActivityIndicator,
 * TextInput, Button, Menu, Badge, …) with `useNativeDriver: true`. On
 * react-native-web there is no native animated module, so paper transparently
 * falls back to JS animation — but each mount still logs the same noisy
 * "useNativeDriver is not supported because the native animated module is
 * missing" warning. Our own animations are already gated to
 * `useNativeDriver: false` on web, so this message is purely third-party noise.
 *
 * Drop exactly that one warning on web; everything else passes through
 * untouched. Imported for its side effect at the top of the root layout so it
 * patches `console.warn` once, before any component mounts.
 */
if (
  Platform.OS === 'web' &&
  typeof console !== 'undefined' &&
  !(console as unknown as { __nativeDriverWarnPatched?: boolean }).__nativeDriverWarnPatched
) {
  const original = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes('useNativeDriver` is not supported')) return;
    original(...(args as Parameters<typeof console.warn>));
  };
  (console as unknown as { __nativeDriverWarnPatched?: boolean }).__nativeDriverWarnPatched = true;
}
