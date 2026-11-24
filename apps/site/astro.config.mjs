import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://toni-bobocel.github.io',
  base: '/weft',
  trailingSlash: 'always',
  // three.js is one ~600 kB chunk by design; it loads once and persists across pages.
  vite: { build: { chunkSizeWarningLimit: 800 } },
})
