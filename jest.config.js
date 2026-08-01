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

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
  // jest-expo already derives these from tsconfig's `paths`; stated explicitly
  // so the aliases keep working if that preset behaviour ever changes.
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/services/analytics.ts',
    'src/services/sales-repository.ts',
    'src/utils/payment-status.ts',
    'src/utils/date.ts',
    'src/utils/currency.ts',
  ],
};
