import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.test.ts'],
    // A run that finds no tests must fail. A green check that asserted nothing
    // reads as "tests passed" and is worse than no check at all.
    passWithNoTests: false,
  },
});
