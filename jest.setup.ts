/**
 * Guard: the suite MUST run in Africa/Lagos (UTC+1).
 *
 * Audit §1.3 bug #1 — `computeDashboardMetrics` decides "today" with
 * `toISOString().split('T')[0]`, i.e. in UTC. That bug is only observable when
 * local time differs from UTC. On a UTC machine (which is what a default
 * GitHub Actions runner is) the test that pins it would pass for the wrong
 * reason and prove nothing.
 *
 * jest.config.js sets process.env.TZ before workers fork. This asserts it
 * actually took effect, so a misconfigured environment fails loudly instead of
 * silently weakening the suite.
 */
const EXPECTED_TZ = 'Africa/Lagos';
const actualTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

if (actualTz !== EXPECTED_TZ) {
  throw new Error(
    `Tests must run in ${EXPECTED_TZ} but the resolved timezone is "${actualTz}".\n` +
      `The UTC-vs-local bugs these tests pin are invisible outside a UTC-offset zone.\n` +
      `Check that jest.config.js sets process.env.TZ and that TZ is not overridden in your shell.`,
  );
}

// A UTC+1 offset is the actual property the date tests depend on; assert it
// directly rather than trusting the zone name alone. (Lagos has no DST, so
// this holds year-round.)
const januaryOffset = new Date('2026-01-15T12:00:00Z').getTimezoneOffset();
const julyOffset = new Date('2026-07-15T12:00:00Z').getTimezoneOffset();

if (januaryOffset !== -60 || julyOffset !== -60) {
  throw new Error(
    `Expected a constant UTC+1 offset for ${EXPECTED_TZ}, got ` +
      `January=${-januaryOffset}min July=${-julyOffset}min. The ICU timezone data may be missing.`,
  );
}

/**
 * AsyncStorage has no native module under Jest, and importing it throws at
 * module load. The pending-write journal lives in the money path — every
 * repository now imports it — so without this every service suite fails on
 * import rather than on anything it asserts.
 *
 * The package ships this mock for exactly that. A test that needs storage to
 * misbehave (see `pending-journal.test.ts`) declares its own `jest.mock`, which
 * takes precedence over this one.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
