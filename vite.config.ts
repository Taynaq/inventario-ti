import { defineConfig } from 'vitest/config';

// base './' deixa o build funcionar em qualquer hospedagem estática
// (GitHub Pages em subpasta, Cloudflare Pages, Netlify, servidor próprio).
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'] },
});
