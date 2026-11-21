import { fileURLToPath, URL } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { seoShells } from './scripts/vite-plugin-seo.mjs';

export default defineConfig({
  plugins: [react(), cloudflare(), seoShells()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/client', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});

