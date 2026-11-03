import { defineConfig } from 'vitest/config';
export default defineConfig({
  base: './',
  build: { target: 'chrome156', rollupOptions: { input: { app: 'index.html', popup: 'popup.html' } } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
