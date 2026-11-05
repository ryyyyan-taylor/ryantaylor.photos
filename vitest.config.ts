import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { GALLERY_AUTH_SECRET: 'test-secret', STATS_API_TOKEN: 'test-token' } },
    }),
  ],
  test: {
    include: ['test/worker/**/*.test.ts'],
    restoreMocks: true,
  },
});
