// Standalone Vitest config for @mng/ui's PURE modules (geometry builders,
// pixel-art renderers — anything with no Angular import). Component specs
// belong to `ng test`; these run in plain Node because their subjects are
// framework-free string builders that the QR/icon components consume.
import { defineConfig } from 'vitest/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  resolve: {
    alias: {
      '@mng/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
});
