import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/ui/**/*.test.ts'],
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/ui/**', 'happy-dom'],
    ],
    globals: true,
    coverage: {
      provider: 'v8',
      // Report on every source file, not just the ones a test happened to
      // import — otherwise untested modules vanish from the report entirely.
      all: true,
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
