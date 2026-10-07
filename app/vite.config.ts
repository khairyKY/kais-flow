import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

// T-3: stamp every build with the commit it came from, so "live = the merged commit" is provable
// from outside — GET /version.json, or the kf-build meta tag in index.html. Cloudflare Workers
// Builds exposes the SHA as WORKERS_CI_COMMIT_SHA; local builds fall back to git.
function buildStamp(): Plugin {
  let commit = process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || ''
  if (!commit) {
    try {
      commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      commit = 'unknown'
    }
  }
  const builtAt = new Date().toISOString()
  // The release this build is (site/src/releases.json's newest, = lib/whatsNew's BUNDLED_VERSION), so an
  // open tab can tell "v1.0.22 is out" from just another deploy of the same version.
  const version = (JSON.parse(readFileSync(new URL('../site/src/releases.json', import.meta.url), 'utf8')) as { v: string }[])[0].v
  return {
    name: 'kf-build-stamp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'kf-build', content: `${commit} ${builtAt}` }, injectTo: 'head' }],
    // Not in the PWA precache (globPatterns has no json), so a fetch always reaches the server.
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ commit, builtAt, version }) + '\n' })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    buildStamp(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
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
          // Kai's Final — Source Serif K (App Icons.dc.html). The maskable one is full-bleed paper with
          // the K inside the 80% safe circle; the two above keep the design's rounded corners.
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Web Push: shows the payload notify sends (supabase/functions/notify/copy.ts) and runs its
        // buttons (public/sw-push.js). A plain script beside the generated worker.
        importScripts: ['sw-push.js'],
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
  // The notification copy is one module shared with the notify edge function
  // (supabase/functions/notify/copy.ts), and the release notes are the site's (site/src/releases.json,
  // lib/whatsNew); the dev server may read those two outside app/.
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../supabase/functions/notify', '../site/src/releases.json'] } },
})
