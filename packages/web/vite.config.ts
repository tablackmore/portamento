import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Relative base so the same build works at github.io/<repo>/ and anywhere else.
  base: './',
  resolve: {
    alias: {
      // Point at core's source so dev server and web build never need a prebuilt dist.
      '@portamento/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
});
