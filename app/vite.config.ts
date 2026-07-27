import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: "Kai's Flow",
        short_name: 'KaisFlow',
        description: 'A life-OS: tasks, calendar, routines, journal, and more in one place.',
        theme_color: '#EFE9DB',
        background_color: '#EFE9DB',
        display: 'standalone',
        start_url: '/',
        // Punch 24: makes Kai's Flow a real Android share target. GET (not POST) on purpose —
        // Chrome fills these as query params on a plain navigation, so no service-worker
        // POST handler is needed and /share is just another SPA route (features/capture/SharePage).
        share_target: {
          action: '/share',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // 3.8k self-hosted emoji glyphs (public/emoji/) — too many to bulk-precache
        // for a niche icon a user may see a handful of. Cached on first use instead
        // (runtimeCaching below); an unseen one falls back to the plain character.
        globIgnores: ['**/emoji/**'],
        runtimeCaching: [
          {
            urlPattern: /\/emoji\/.*\.svg$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'emoji-glyphs',
              expiration: { maxEntries: 500 },
            },
          },
        ],
      },
    }),
  ],
})
