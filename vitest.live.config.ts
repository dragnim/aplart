import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Exercises the real TryAPL endpoint. Run deliberately via `npm run test:live`.
// Never wire this into the required pull request checks: a temporary outage of
// an external service must not fail ordinary contributions.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/live/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The endpoint is a shared public service; keep our request rate polite by
    // running one file at a time rather than fanning out across workers.
    fileParallelism: false,
  },
});
