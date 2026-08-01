/**
 * Expo SDK 57 does not require a Babel config for Metro — it applies
 * `babel-preset-expo` implicitly. `jest-expo` transforms via `babel-jest`,
 * which DOES need a resolvable config, so this file exists for the test run.
 *
 * The content is exactly what Metro already applies, so adding it changes no
 * runtime behaviour. The web-only `resolveRequest` shim in metro.config.js is
 * resolver-level and unaffected.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
