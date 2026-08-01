import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
    ],
    // tests/live hits the real TryAPL endpoint and must never gate a pull
    // request; it runs under vitest.live.config.ts instead.
    exclude: ['tests/live/**', 'tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
});
