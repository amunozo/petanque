import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(process.env['BUILD_ID'] || 'dev'),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
  plugins: [
    // Offline support (Workbox generateSW). The web manifest is hand-written in
    // public/manifest.webmanifest, and the page registers the worker itself
    // (src/app/pwa.ts, production only), so the plugin only emits `sw.js`.
    // Everything in the precache manifest is relative to the worker's location,
    // so the build works from any sub-path (versioned deploys, future root domain).
    VitePWA({
      registerType: 'prompt', // a new worker waits until the player taps "Update" (no skipWaiting on its own)
      injectRegister: false,
      manifest: false,
      workbox: {
        // App shell, hashed JS/CSS chunks (incl. the AI worker), fonts, 3D models, icons, privacy page.
        globPatterns: ['**/*.{js,css,html,woff2,glb,png,webp,svg,webmanifest}'],
        globIgnores: ['**/.well-known/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true, // the first load is controlled right away, so offline works without a second visit
        // `?source=pwa`, `?mode=ai&seed=…` etc. still hit the precached page.
        ignoreURLParametersMatching: [/.*/],
        navigateFallback: 'index.html',
        // A frozen build under /v/<version>/ or the assetlinks file must never fall back to this app's shell.
        navigateFallbackDenylist: [/\/v\/[^/]+\/./, /\.well-known\//],
      },
    }),
  ],
});
