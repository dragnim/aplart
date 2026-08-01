import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The site is served from https://dragnim.github.io/aplart/, so every asset
// URL must be prefixed. VITE_BASE lets a custom domain override this without
// touching the config.
const base = process.env.VITE_BASE ?? '/aplart/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
