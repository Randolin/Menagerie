// Standalone Vitest config for @mng/core — runs in PLAIN NODE, no jsdom, no
// Angular. This structurally proves the domain library is framework-free:
// Node 22+ provides crypto.subtle, CompressionStream, atob/btoa natively.
import { defineConfig } from 'vitest/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
});
