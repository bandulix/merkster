import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME, APP_SLUG, APP_TAGLINE_EN } from './shared/brand';

// The web app lives in web/, builds to dist/web and is served by the Fastify server (same origin as /api).
export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: { outDir: '../dist/web', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_URL || 'http://localhost:8080', changeOrigin: false } }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',          // show an "update available" prompt instead of silently swapping versions
      injectRegister: false,           // registered from src/pwa.tsx
      includeAssets: ['icons/favicon.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png', 'fonts/*.woff2'],
      manifest: {
        id: '/',
        name: APP_NAME,
        short_name: APP_NAME,
        description: APP_TAGLINE_EN,
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0d0f1e',
        theme_color: '#0d0f1e',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // app shell: precache the built JS/CSS/HTML, icons and fonts (not the 18 MB OCR data)
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        globIgnores: ['vendor/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          { // OCR engine, language data and pdf.js: cache on first use (or via "make OCR available offline")
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/vendor/'),
            handler: 'CacheFirst',
            options: { cacheName: `${APP_SLUG}-vendor`, expiration: { maxEntries: 40 }, cacheableResponse: { statuses: [0, 200] } }
          }
        ]
      }
    })
  ],
  test: {
    // unit tests: learning logic, sync, progression, grades
    root: '.',
    include: ['web/src/**/*.test.ts', 'server/test/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node'
  }
} as never);
