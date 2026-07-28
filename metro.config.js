// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

/**
 * Web-only fix for the noisy react-native-web warning:
 *   "Animated: `useNativeDriver` is not supported because the native animated
 *    module is missing…"
 *
 * react-native-paper (and other libraries) animate with `useNativeDriver: true`.
 * On web there is no native animated module, so react-native-web logs that
 * warning the first time any such animation runs. We can't edit those library
 * call sites, so instead we redirect the web build's `NativeAnimatedHelper` to
 * a shim whose `shouldUseNativeDriver()` returns false silently
 * (shims/native-animated-helper.web.js). This fixes it at the source for every
 * caller — ours and third-party — with no console patching.
 */
const nativeAnimatedShim = path.resolve(__dirname, 'shims/native-animated-helper.web.js');
const NATIVE_ANIMATED_HELPER_RE = /[\\/]Animated[\\/]NativeAnimatedHelper\.js$/;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolved = context.resolveRequest(context, moduleName, platform);

  if (
    platform === 'web' &&
    // Don't redirect the shim's own import of the real helper (avoids recursion).
    context.originModulePath !== nativeAnimatedShim &&
    resolved &&
    resolved.type === 'sourceFile' &&
    typeof resolved.filePath === 'string' &&
    NATIVE_ANIMATED_HELPER_RE.test(resolved.filePath)
  ) {
    return { type: 'sourceFile', filePath: nativeAnimatedShim };
  }

  return resolved;
};

module.exports = config;
