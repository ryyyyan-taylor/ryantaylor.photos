import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ryantaylor.photos',
  output: 'static',
  integrations: [sitemap({ filter: (page) => !page.includes('/utils/') })],
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
