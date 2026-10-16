import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const contracts = fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url));

export default defineConfig(({ mode }) => {
  // NEXORA_API_URL is read only by the dev/preview server (never exposed to the bundle: no VITE_ prefix).
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');
  const target = env.NEXORA_API_URL || 'http://127.0.0.1:3001';
  // The browser only talks to /api on its own origin; the proxy forwards to the API without the prefix.
  const proxy = { '/api': { target, changeOrigin: false, rewrite: (p: string) => p.replace(/^\/api/, '') } };
  return {
    plugins: [react()],
    resolve: { alias: { '@nexora/contracts': contracts } },
    server: { port: 5173, strictPort: true, host: 'localhost', proxy },
    preview: { port: 4173, strictPort: true, host: 'localhost', proxy },
    build: {
      outDir: 'dist',
      sourcemap: true,
      // Long-lived vendor chunks: app updates do not invalidate the cached libraries.
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router'],
            charts: ['lightweight-charts'],
            data: ['@tanstack/react-query', 'zod'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test-setup.ts'],
    },
  };
});
