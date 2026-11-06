import { defineConfig } from 'vitest/config';
export default defineConfig({
  base: './',
  build: { target: 'chrome156', rollupOptions: { input: { app: 'index.html', viewer: 'viewer.html' } } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
