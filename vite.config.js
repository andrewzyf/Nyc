import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built game can be hosted from any sub-path (GitHub Pages, itch.io, etc.)
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
