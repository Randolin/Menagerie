// Standalone Vitest config for @moxy/core — runs in PLAIN NODE, no jsdom, no
// Angular. This structurally proves the domain library is framework-free:
// Node 22+ provides crypto.subtle, CompressionStream, atob/btoa natively.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
});
