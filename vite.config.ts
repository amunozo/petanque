import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(process.env['BUILD_ID'] || 'dev'),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
});
