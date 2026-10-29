import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Rollup } from 'vite'
import { fileURLToPath } from 'node:url'
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

// iOS PWA (2026-10-29), precache diet: the service worker precaches the shell and the tab bar's pages only —
// the entry's own chunks (index.html's), plus Today, Inbox, Tasks, Calendar, the task sheet and the capture bar,
// and everything they import. Every other page's script loads when it's opened (runtime cache below). The set is
// read from the bundle graph, so it can't drift from the code.
const SHELL_PAGES = /\/(TodayPage|InboxPage|TasksPage|CalendarPage|TaskSheet|CommandBar|drag)\.tsx$/
const shellChunks = new Set<string>()
function shellChunkSet(): Plugin {
  return {
    name: 'kf-shell-chunks',
    apply: 'build',
    generateBundle(_options, bundle: Rollup.OutputBundle) {
      const chunks = Object.values(bundle).filter((c): c is Rollup.OutputChunk => c.type === 'chunk')
      const byFile = new Map(chunks.map((c) => [c.fileName, c]))
      const visit = (c: Rollup.OutputChunk | undefined) => {
        if (!c || shellChunks.has(c.fileName)) return
        shellChunks.add(c.fileName)
        c.imports.forEach((file) => visit(byFile.get(file)))
      }
      chunks.filter((c) => (c.isEntry && c.name === 'main') || (c.isDynamicEntry && SHELL_PAGES.test(c.facadeModuleId ?? ''))).forEach(visit)
    },
  }
}

// iOS PWA (2026-10-29), the launch screen: iOS ignores the manifest's background and shows a blank screen until
// the first paint, unless index.html links an apple-touch-startup-image for the exact screen. One PNG per common
// iPhone size, Day and Night: the app icon centred on the page background — --paper-linen, read from the tokens
// (colors.css / colors.dark.css). Made at build time with sharp (already installed, through wrangler); without it
// the build goes on and the launch screen is simply blank, as before. Not precached: iOS fetches them at install.
const IPHONES: [number, number, number][] = [
  // CSS width × height, device pixel ratio (portrait)
  [375, 667, 2], // SE 2nd/3rd gen, 8
  [414, 896, 2], // 11, XR
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [390, 844, 3], // 12, 13, 14, 12/13 Pro
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [430, 932, 3], // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [420, 912, 3], // Air
]
function tokenHex(file: string, name: string): string {
  const m = readFileSync(new URL(`./src/styles/tokens/${file}`, import.meta.url), 'utf8').match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`startup images: no ${name} in ${file}`)
  return m[1]
}
function startupImages(): Plugin {
  const looks = [
    { theme: 'day', scheme: 'light', bg: tokenHex('colors.css', '--paper-linen') },
    { theme: 'night', scheme: 'dark', bg: tokenHex('colors.dark.css', '--paper-linen') },
  ]
  const file = (w: number, h: number, r: number, theme: string) => `startup/${w * r}x${h * r}-${theme}.png`
  let made = false
  return {
    name: 'kf-startup-images',
    apply: 'build',
    async buildStart() {
      made = false
    },
    async generateBundle() {
      let sharp: typeof import('sharp').default
      try {
        sharp = (await import('sharp')).default
      } catch {
        this.warn('sharp is not installed: no iOS launch screens this build')
        return
      }
      const icon = readFileSync(new URL('./public/icon-512.png', import.meta.url))
      for (const [w, h, r] of IPHONES) {
        const side = Math.round(Math.min(w, h) * r * 0.32) // the icon at about a third of the short side
        const mark = await sharp(icon).resize(side, side).toBuffer()
        for (const { theme, bg } of looks) {
          const png = await sharp({ create: { width: w * r, height: h * r, channels: 3, background: bg } })
            .composite([{ input: mark, gravity: 'centre' }])
            .png({ compressionLevel: 9, palette: true }) // flat paper and one icon: 256 colours is plenty, ~25 KB a screen
            .toBuffer()
          this.emitFile({ type: 'asset', fileName: file(w, h, r, theme), source: png })
        }
      }
      made = true
    },
    transformIndexHtml: {
      order: 'post',
      handler: () =>
        made
          ? IPHONES.flatMap(([w, h, r]) =>
              looks.map(({ theme, scheme }) => ({
                tag: 'link',
                attrs: { rel: 'apple-touch-startup-image', href: `/${file(w, h, r, theme)}`, media: `screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})` },
                injectTo: 'head' as const,
              })),
            )
          : [],
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    buildStamp(),
    shellChunkSet(),
    startupImages(),
    VitePWA({
      // 'prompt', not 'autoUpdate' (iOS PWA 2026-10-29): a new version waits until nothing would be lost by the
      // reload — main.tsx applies it when the app is put away or reopened with no sheet open and no field in use.
      registerType: 'prompt',
      // F25: the manifest's icons and favicon / apple-touch-icon were precached twice (globPatterns has them).
      includeManifestIcons: false,
      manifest: {
        // Stable identity even if start_url ever changes (F22).
        id: '/',
        name: "Kai's Flow",
        // The Home Screen label (F21): "Kai's Flow" fits (10 characters); was "KaisFlow".
        short_name: "Kai's Flow",
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
        // F23: a long-press on the Android icon (iOS ignores shortcuts). Capture runs through the widgets' kfAction.
        shortcuts: [
          { name: 'Capture', short_name: 'Capture', url: '/today?kfAction=capture' },
          { name: 'Calendar', short_name: 'Calendar', url: '/calendar' },
          { name: 'Inbox', short_name: 'Inbox', url: '/inbox' },
        ],
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
        // iOS PWA (2026-10-29), a first install under 3 MB (was 9.9): the design-system art (ds/, 5.3 MB of PNGs),
        // the font files for scripts the app doesn't write in (only latin is precached; the CSS still lists every
        // subset, so a Greek or Cyrillic name still renders), the 512px icons (the system fetches those itself), the
        // launch screens and the Windows tray's page are fetched when needed instead — and cached then (below).
        globIgnores: ['**/emoji/**', 'ds/**', 'startup/**', 'tray.html', 'icon-512.png', 'icon-maskable-512.png', '**/*-{latin-ext,cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        // ...and only the shell's and the tab pages' scripts (shellChunkSet above); the rest load on first open.
        manifestTransforms: [(entries) => ({ manifest: entries.filter((e) => !/^assets\/.*\.js$/.test(e.url) || shellChunks.has(e.url)), warnings: [] })],
        // The privacy policy is a real page (public/privacy.html — Google's OAuth consent screen links it),
        // never the app shell.
        navigateFallbackDenylist: [/^\/privacy(\.html)?\/?$/], // Cloudflare serves privacy.html at /privacy
        runtimeCaching: [
          {
            urlPattern: /\/emoji\/.*\.svg$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'emoji-glyphs',
              expiration: { maxEntries: 500 },
            },
          },
          // The notification sound packs (public/notification-sounds, 2.5 MB — not precached): each WAV
          // is kept once it has played, so the pack still sounds offline.
          {
            urlPattern: /\/notification-sounds\/.*\.wav$/,
            handler: 'CacheFirst',
            options: { cacheName: 'notification-sounds', expiration: { maxEntries: 40 } },
          },
          // What the precache leaves out (iOS PWA 2026-10-29), kept once it has been fetched so it works offline
          // after. Hashed file names: a cached copy is never stale.
          {
            urlPattern: /\/assets\/.*\.(js|woff2)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'kf-assets', expiration: { maxEntries: 200 } },
          },
          {
            urlPattern: /\/ds\/assets\/.*\.(png|webp)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'kf-ds-art', expiration: { maxEntries: 80 } },
          },
        ],
      },
    }),
  ],
  // The notification copy is one module shared with the notify edge function
  // (supabase/functions/notify/copy.ts), and the release notes are the site's (site/src/releases.json,
  // lib/whatsNew); the dev server may read those two outside app/.
  // Two pages: the app, and the Windows tray's windows (tray.html — src-tauri tray.rs, features/tray/entry.tsx).
  build: { rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), tray: fileURLToPath(new URL('./tray.html', import.meta.url)) } } },
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../supabase/functions/notify', '../site/src/releases.json'] } },
})
