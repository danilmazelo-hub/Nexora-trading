import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Unit tests: pure logic under src/ (no database).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { alias: { '@nexora/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts') } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
