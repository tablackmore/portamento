import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // Coverage is enforced on the pure, network-free logic — the format,
      // share-link codec, matching engine and PKCE primitives. Service
      // adapters and the OAuth flow need live APIs/browser redirects and are
      // exercised manually instead.
      include: ['src/format/**/*.ts', 'src/matching/**/*.ts', 'src/auth/pkce.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
