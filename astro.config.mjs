import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const manifestPath = fileURLToPath(new URL('./src/data/photos.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const unlistedSlugs = new Set(manifest.galleries.filter((g) => g.unlisted).map((g) => g.slug));

export default defineConfig({
  site: 'https://ryantaylor.photos',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) => {
        if (page.includes('/utils/')) return false;
        const slug = new URL(page).pathname.replace(/^\/|\/$/g, '');
        return !unlistedSlugs.has(slug);
      },
    }),
  ],
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
