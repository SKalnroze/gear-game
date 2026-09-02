import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/ui/**/*.test.ts'],
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/ui/**', 'happy-dom'],
    ],
    globals: true,
  },
  resolve: {
    alias: {
      // Allow UI tests to use the phaser mock
    },
  },
});
