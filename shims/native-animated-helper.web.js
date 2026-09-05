/**
 * Web shim for react-native-web's Animated `NativeAnimatedHelper`.
 *
 * Metro swaps every web import of `.../Animated/NativeAnimatedHelper.js` for
 * this file (see metro.config.js). The web bundle has no native animated
 * module, so the real `shouldUseNativeDriver()` logs
 *   "Animated: `useNativeDriver` is not supported because the native animated
 *    module is missing…"
 * the first time any component (ours or a library like react-native-paper)
 * animates with `useNativeDriver: true`.
 *
 * We re-export the real helper unchanged except for `shouldUseNativeDriver`,
 * which silently returns `false` on web — fixing the warning at its source for
 * every call site without editing them. The Metro resolver skips the swap for
 * imports originating from this file, so the `import … from '…/NativeAnimatedHelper'`
 * below resolves to the real module (no recursion).
 */
import Real, {
  API,
  isSupportedColorStyleProp,
  isSupportedStyleProp,
  isSupportedTransformProp,
  isSupportedInterpolationParam,
  addWhitelistedStyleProp,
  addWhitelistedTransformProp,
  addWhitelistedInterpolationParam,
  validateStyles,
  validateTransform,
  validateInterpolation,
  generateNewNodeTag,
  generateNewAnimationId,
  assertNativeAnimatedModule,
  transformDataType,
} from 'react-native-web/dist/vendor/react-native/Animated/NativeAnimatedHelper';

/** Web has no native animated module — never use the native driver, quietly. */
function shouldUseNativeDriver() {
  return false;
}

export {
  API,
  isSupportedColorStyleProp,
  isSupportedStyleProp,
  isSupportedTransformProp,
  isSupportedInterpolationParam,
  addWhitelistedStyleProp,
  addWhitelistedTransformProp,
  addWhitelistedInterpolationParam,
  validateStyles,
  validateTransform,
  validateInterpolation,
  generateNewNodeTag,
  generateNewAnimationId,
  assertNativeAnimatedModule,
  shouldUseNativeDriver,
  transformDataType,
};

export default {
  API,
  isSupportedColorStyleProp,
  isSupportedStyleProp,
  isSupportedTransformProp,
  isSupportedInterpolationParam,
  addWhitelistedStyleProp,
  addWhitelistedTransformProp,
  addWhitelistedInterpolationParam,
  validateStyles,
  validateTransform,
  validateInterpolation,
  generateNewNodeTag,
  generateNewAnimationId,
  assertNativeAnimatedModule,
  shouldUseNativeDriver,
  transformDataType,
  // Delegate lazily so we don't eagerly construct a NativeEventEmitter on web.
  get nativeEventEmitter() {
    return Real.nativeEventEmitter;
  },
};
