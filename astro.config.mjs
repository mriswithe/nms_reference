// @ts-check
import { defineConfig } from 'astro/config';

// Deployed to GitHub Pages at https://mriswithe.github.io/nms_reference/
export default defineConfig({
  site: 'https://mriswithe.github.io',
  base: '/nms_reference',
  trailingSlash: 'ignore',
});
