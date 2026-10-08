// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://njesia5.example',
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  trailingSlash: 'never',
  build: { inlineStylesheets: 'always', format: 'file' },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  security: { checkOrigin: true },
  devToolbar: { enabled: false },
  vite: {
    server: { watch: { ignored: ['**/tools/**', '**/.impeccable/**', '**/.wrangler/**'] } },
    build: { assetsInlineLimit: 0 },
  },
});
