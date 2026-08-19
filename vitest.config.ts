import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const coverage = {
  provider: 'v8' as const,
  reporter: ['text', 'text-summary', 'json-summary', 'html'],
  reportsDirectory: './coverage',
  include: ['src/**/*.{ts,tsx}'],
  exclude: [
    'src/**/*.{test,spec}.{ts,tsx}',
    'src/**/*.ui.test.{ts,tsx}',
    'src/test/**',
    'src/vite-env.d.ts',
    'src/main.tsx',
    'src/api/transport/HidTransport.ts',
  ],
  // Floor is slightly below the current ~66/63/54/57 so CI fails on
  // real regressions, not coverage jitter.
  thresholds: {
    lines: 60,
    statements: 58,
    functions: 50,
    branches: 52,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    coverage,
    projects: [
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'happy-dom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.ui.test.{ts,tsx}'],
          exclude: ['node_modules', 'dist', 'tests/desktop/**'],
          env: {
            VITE_MOCK_DEVICE: 'true',
          },
          testTimeout: 15_000,
          hookTimeout: 15_000,
          restoreMocks: true,
          clearMocks: true,
          css: true,
          fileParallelism: false,
          coverage,
        },
      },
      {
        extends: true,
        test: {
          name: 'desktop',
          environment: 'node',
          include: ['tests/desktop/**/*.test.mjs'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
    ],
  },
});