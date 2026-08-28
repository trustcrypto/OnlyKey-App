import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const coverage = {
  provider: 'v8' as const,
  reporter: ['text', 'text-summary', 'json-summary', 'html'],
  reportsDirectory: './coverage',
  include: ['src/**/*.{ts,tsx}', 'scripts/mac-universal.mjs'],
  exclude: [
    'src/**/*.{test,spec}.{ts,tsx}',
    'src/**/*.ui.test.{ts,tsx}',
    'src/test/**',
    'src/vite-env.d.ts',
    'src/main.tsx',
    'src/**/*.d.ts',
    'src/api/device/DeviceClient.ts',
    'src/api/transport/Transport.interface.ts',
    'src/services/keyImport/types.ts',
  ],
  thresholds: {
    lines: 75,
    statements: 75,
    functions: 75,
    branches: 75,
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
          include: [
            'src/**/*.{test,spec}.{ts,tsx}',
            'src/**/*.ui.test.{ts,tsx}',
            'tests/desktop/release-packaging.static.test.mjs',
          ],
          exclude: ['node_modules', 'dist'],
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