/**
 * Jest harness for the pure-function layer (analytics, payment-status, date,
 * currency, sales-repository normalizers).
 *
 * TIMEZONE: this must run in Africa/Lagos. The "today is computed in UTC" bug
 * (audit §1.3 #1) only manifests when local time differs from UTC — on a UTC
 * runner the test for it would pass vacuously and prove nothing. Setting TZ
 * here runs in the parent process before workers fork, so workers inherit it.
 * jest.setup.ts asserts the zone actually took effect.
 */
process.env.TZ = 'Africa/Lagos';

/**
 * `@/lib/auth.native.ts` throws at module-load time if these are unset — a
 * real guard for the app, but it also means any test that transitively
 * imports it (via services/db.ts, outbox-send.ts, and everything built on
 * those) fails at import, not at an assertion, in an environment with no
 * `.env.local` — which is exactly what a fresh CI checkout is. Nothing under
 * test talks to a real Supabase project regardless (every test that reaches
 * this far mocks `@/lib/auth` or `@/services/db` — see create-batch.test.ts
 * and friends), so a placeholder that merely satisfies the "are these set"
 * check is enough. `||=` so a real exported value (local dev after
 * `supabase start`) still wins.
 */
process.env.EXPO_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||= 'test-placeholder-anon-key';

// Jest REPLACES preset keys rather than merging them. Declaring
// `moduleNameMapper` below without this would drop the preset's own mappings —
// notably `^react-native($|/.*)`, without which react-native resolves to source
// that Jest cannot render and @testing-library's `render` silently no-ops.
const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // `scripts/` is included so the backup script's judgement — what it refuses
  // to write — is proven rather than eyeballed. Those helpers are plain CJS
  // `.js`, outside tsconfig's `**/*.ts` include, so they need naming here.
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts?(x)',
    '<rootDir>/scripts/**/__tests__/**/*.test.js',
  ],
  // jest-expo already derives these from tsconfig's `paths`; stated explicitly
  // so the aliases keep working if that preset behaviour ever changes.
  moduleNameMapper: {
    // Must precede the '@/' catch-all: theme.ts imports '@/global.css' for
    // Nativewind, and Jest has no CSS transformer.
    '\\.(css)$': '<rootDir>/src/test-support/style-mock.js',
    // Assets before the catch-all, or '@/assets/x.png' resolves to src/assets.
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    // Everything else the preset maps, kept because this key overrides it.
    ...Object.fromEntries(
      Object.entries(expoPreset.moduleNameMapper ?? {}).filter(([k]) => !k.startsWith('^@/')),
    ),
  },
  collectCoverageFrom: [
    'src/services/analytics.ts',
    'src/services/sales-repository.ts',
    'src/utils/payment-status.ts',
    'src/utils/date.ts',
    'src/utils/currency.ts',
  ],
};
