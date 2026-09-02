import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/ui/**/*.test.ts'],
    // Vitest 4 removed environmentMatchGlobs; files needing a DOM opt in with
    // a `@vitest-environment happy-dom` docblock instead.
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      // `include` is what makes untested files show up at all — without it v8
      // reports only files a test happened to import, which reads far higher
      // than the real number. (Vitest 4 dropped the old `all` flag; setting
      // `include` is now the way to get the same behaviour.)
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/types/**', 'src/main.ts', 'src/config.ts'],
      reporter: ['text-summary', 'json-summary'],
    },
  },
  resolve: {
    alias: {
      // Allow UI tests to use the phaser mock
    },
  },
});
