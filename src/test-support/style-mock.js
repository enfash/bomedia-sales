/**
 * Stub for stylesheet imports under Jest.
 *
 * `constants/theme.ts` does `import '@/global.css'` for Nativewind. Jest has no
 * CSS transformer, so any test that reaches the theme — which is most component
 * tests — fails to parse the file rather than the code under test.
 */
module.exports = {};
