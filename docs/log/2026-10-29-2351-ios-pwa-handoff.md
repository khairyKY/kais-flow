# ios-pwa — the iPhone Home Screen app, all 29 audit findings

Branch `claude/ios-pwa` (from `claude/kai-bugs-1012`, merged again at bbc0a176 = v1.6.0 + today-v2 + cal-scroll). Not merged, not released.
Audit: `D:\Coding\_claude-cloud\kais-flow-ios-pwa-audit-2026-10-29.md`. Research: `…-integrations-research-2026-10-29.md` part 2.

## Numbers

| | Before | After |
|---|---|---|
| Precache (production build) | 313 entries · 9,955 KiB | **148 entries · 2,592 KiB** (< 3 MB) |
| Lighthouse mobile `/sign-in` (median of 3, cold) | 66 · FCP 5.0 s · LCP 5.7 s · TBT 70 ms · 1,396 KiB | 67 · FCP 5.0 s · LCP 5.5 s · TBT 40 ms · **598 KiB** (no page prefetch, no fern) |
| Lighthouse mobile `/today`, signed in (median of 3, cold) | 48 · FCP 5.8 s · LCP 11.2 s · TBT 320 ms · TTI 12.3 s · 1,408 KiB | 52 · FCP 5.8 s · LCP 8.4 s · TBT 270 ms · TTI 9.2 s · 1,237 KiB |
| ios-audit.mjs: fields under 16px (per phone) | 3 (12.5 / 14 / 15) | **0** on all three |
| ios-audit.mjs: Chat field hidden by the keyboard | yes, all 3 phones | **no** — visible on all three |
| ios-audit.mjs: Today under the Dynamic Island (edge-to-edge) | 1 | 1 (see note) |
| ios-audit.mjs: small tap targets (iPhone 15, all screens) | 183 | 175 |
| ios-audit.mjs: controls in the home-indicator band (iPhone 15) | 98 | 104 (see note) |

Notes on the audit counts — the edge-to-edge Today count stays 1 because the audit can't give `env()` a value, so `--sat` is 0 there (verify.mjs, with the insets set, finds nothing under the status bar on any phone). The home-band count went 98 → 104 for the same reason plus the new 44px rows; with the iPhone's 34px inset the tab bar and + sit above the band (verify.mjs). ios-audit.mjs can't simulate the insets (WebKit desktop reports `env()` = 0) and only credits `.kf-hit` hit areas, so its tap-target and home-band counts barely move — the fixes are an `::after` hit area and a padding driven by the real inset. `verify.mjs` measures both properly (insets set through the `--sat` / `--sab` tokens, hit areas read from the `::after` box).

Lighthouse "before" is the e39abf90 build (before today-v2 came in); summaries in `assets/ios-pwa/lighthouse-{before,after}.json`. Best Practices 79 on /today is the mock's refused realtime socket, the same before and after.

**Lighthouse ≥ 85 was not reached.** The pass is bound by the shell bundle: ~300 KB gzip of JS has to arrive and run before the first paint (react-dom, supabase-js, react-router, zod, chrono-node and rrule are all in the entry graph), so FCP stays near 5 s on simulated Slow 4G. What this pass changed (prefetch only after sign-in and only the tab pages, the worker registered after `load`, the sign-in fern not fetched on a phone) doesn't touch that. To get there: (1) load chrono-node / rrule / zod on first use instead of in the shell; (2) make the signed-in shell (AppLayout) its own chunk so `/sign-in` doesn't carry it; (3) the design-system art: Today pulls `clover/awake.png` (227 KB) for a 34 px picture — WebP at display size would cut most of it, but that's Kai's art, so it waits for his eye.

## Findings

| # | Finding | Status | What / why |
|---|---|---|---|
| F1 | No `viewport-fit=cover` | Fixed | `index.html`. No `maximum-scale` (pinch-zoom stays). |
| F2 | No top inset in the chrome | Fixed | Tokens `--sat` / `--sab` (spacing.css) read `env()` once; every surface uses them. Phone: `.app-shell > main` pads `--sat` (top bar, Today's and the calendar's headers, Tasks, Inbox, Settings, Focus, the Plan card and Top 3 header); full sheets `--sheet-h-full: calc(100% - max(48px, var(--sat) + 8px))`; Chat pads `--sat`. Landscape notch: `.app-shell` pads `env(safe-area-inset-left/right)`. All 0 on a computer. |
| F3 | Tab-bar inset fallback never applies | Fixed | `--tabbar-inset: var(--sab)`, and `max(var(--sab), 16px)` in the installed app (`html.kf-standalone`, set pre-paint). **Deviation:** the 16px floor is installed-app only. In a browser tab the browser's own bar sits under the tab bar, and a 16px floor there cost phone-today one visible row at 390px (its ≥7 check failed). |
| F4 | No theme-color / status-bar style | Fixed | Two `theme-color` metas (light/dark media, values = `--paper-linen` day/night). The pre-paint script and `lib/theme.ts` (on every change, a task later so a theme cross-fade isn't forced through a style pass) set both to the app's own theme. `apple-mobile-web-app-status-bar-style` = **`default`**, not black-translucent: black-translucent always draws white text, which vanishes on the day paper; with `default` iOS colours the bar from theme-color and picks the text colour. The top-inset work above makes `black-translucent` a one-word switch if Kai prefers full-bleed after seeing it. |
| F5 | No Add to Home Screen guide | Fixed | `components/InstallGuide.tsx` (the `.kf-hint` look, three steps, Safari's Share glyph). iOS Safari tab only (`lib/iosPwa` — not Chrome/Firefox/in-app browsers, not standalone, not desktop/Android), 2.5 s after load, once per device (`kf-install-guide-dismissed`). Settings → About → This device → Add to Home Screen → Show me how, and Notifications → This browser on iPhone Safari. Plain on purpose. |
| F6 | Subscribe not inside the gesture | Fixed | Settings' Subscribe: `Notification.requestPermission()` is the handler's first await; subscribe only on `granted`. |
| F7 | A push can end without a notification | Fixed | `sw-push.js`: `paper_ready` while focused is shown silently and closed at once (same tag). Every push shows one. |
| F8 | Fields under 16px zoom the page | Fixed | `--field-min` (0, or 16px on `pointer: coarse`, typography.css). index.css: the type tokens read 16px inside a field on touch; inheriting fields get `max(var(--field-min), 1em)` (base layer, so a field's own rule wins); every literal under 16px is floored at its source (`max(var(--field-min), 12.5px)`, NumberField, RenameField, Settings' time fields, `.st-search`, `.st-field`, `.fr-input`, `.rt-input`, `.gd-search`, `.pp-row-input`, `.lp-find`). A computer keeps every size. |
| F9 | Chat ignores the keyboard | Fixed | BottomSheet's `useKeyboardInset` exported; Chat's panel rides between `top` and `bottom`. |
| F10 | No launch screen | Fixed | Build-time (vite.config `startupImages`, sharp — already installed through wrangler; without it the build warns and goes on): 11 iPhone sizes × Day/Night, the icon on `--paper-linen` read from the tokens, palette PNGs (~90 KB each), linked with device + colour-scheme media. Not precached. |
| F11 | Share target is Android-only | Partly | Guide → Capture from anywhere now says the iPhone way: a Shortcut with Show in Share Sheet, sending to the capture link. A ready-made Shortcut needs Kai's iPhone to build and share (an iCloud link) — on his list below. |
| F12 | 9.9 MB precache | Fixed | `ds/**`, non-latin font subsets, the 512px icons, `startup/**` and `tray.html` out; JS limited to the entry's graph + Today/Inbox/Tasks/Calendar/TaskSheet/CommandBar/drag (`shellChunkSet`, read from the bundle graph). Runtime CacheFirst for the rest (`kf-assets`, `kf-ds-art`). The ds PNGs were **not** converted to WebP (Kai's art). |
| F13 | Auto-update reloads mid-typing | Fixed | `registerType: 'prompt'`; main.tsx applies the waiting worker when the app is put away or reopened with no dialog open and no field focused (`quietForUpdate`). A cold start takes it by itself; Settings' Reload and the "vX is out" Update apply it at once. The worker now registers on `load`. |
| F14 | Wrong copy for iOS permission | Fixed | Denied → "iPhone's Settings → Notifications → Kai's Flow" on iOS (Settings message and plan.ts blockers); dismissed → "tap again to answer". |
| F15 | No notification buttons on iOS | Fixed | On Safari (UA in the worker) a single reminder's tap opens `/today?task=<id>` — its task sheet (Done, Tomorrow, the date). Android/Chrome keep their buttons (unit-tested). Cold starts: the worker also leaves the address in Cache Storage and the app takes it (WebKit bug 263687). Events already open their calendar day. |
| F16 | Storage never persistent | Fixed | `persistStorage()` on the signed-in shell's mount, phones/tablets and the installed app only (a desktop Firefox tab would prompt). Settings → About → This device → Storage shows it (+ Keep it). |
| F17 | Tap targets under 44 | Fixed | `::after` hit areas, coarse pointer only (the X4 `kf-hit-min` rule: each side grows only to 44): Today's day arrows, All tasks, the Top 3 load line, rows' ⋯; `.kf-button` drawn under 44 (Inbox File, Replan all); Chat mic/send; Tasks' Repeating / Save as smart list; the Tasks tabs (12px padding the strip takes back with −12px margin, plus a sideways `::after` for "All"); ritual segments to 48. The Now·Day switch is gone (today-v2 moved it to Settings). |
| F18 | Every page prefetched after load | Fixed | `lib/pageWarm`: Today, Inbox, Tasks, Calendar (+ the task sheet) — from the signed-in shell, 2 s after `load`, on idle. Nothing on `/sign-in`. |
| F19 | Heavy sign-in image | Fixed | The fern is `display:none` on a phone; it's `loading="lazy"` now, so a phone never fetches it. Desktop unchanged. |
| F20 | Seven render-blocking CSS files | Skipped | They are the CSS of chunks shared by the shell and the lazy pages. Merging them into one file changes their cascade order when a page later loads its own copy — a desktop look risk for ~250 ms of Lighthouse estimate after the other changes. Worth doing with the shell split above. |
| F21 | Label reads "KaisFlow" | Fixed | `short_name: "Kai's Flow"` + `apple-mobile-web-app-title`. |
| F22 | No manifest id | Fixed | `id: '/'`. |
| F23 | No shortcuts | Fixed | Capture (`/today?kfAction=capture`, the widgets' path), Calendar, Inbox. |
| F24 | No badge | Fixed | `AppBadge` in the shell: the Tasks Today list's count (overdue included, = the sidebar's Due Today) via `setAppBadge`, cleared at 0. Web only. Not from the worker (it doesn't know the count). |
| F25 | Duplicate precache entries | Fixed | `includeManifestIcons: false`, no `includeAssets`. 0 duplicates. |
| F26 | BottomSheet ignores the layout pan | Fixed | The hook also returns `visualViewport.offsetTop` (keyboard up only); sheets sit at `top: offsetTop`. Needs the real iPhone. |
| F27 | Calendar rail strip cut off | Fixed | End gutter as a spacer (WebKit drops a scroller's end padding), `scroll-padding-inline`, and a scroll-driven right-edge fade while there's more (Safari 26+; none before). |
| F28 | Raw `vh` units | Skipped | At 100% (a phone's default) `vh` = `--kf-vh`, so the iPhone gets nothing from it; at a computer's 125% the switch shrinks those pages' minimum heights by 20% — a desktop change this pass mustn't make. For a desktop pass. |
| F29 | iOS ignores some push options | Fixed (copy) | Settings → Notifications → This browser on iOS: "no buttons — tap it to open the task — and plays the iPhone's own sound". Noted in sw-push.js too. |

## Other changes

- `lib/iosPwa.ts` (+ test): `isIOS`, `isIOSSafari`, the guide's rule and store, `persistStorage`/`storageState`, `setAppBadge`.
- Push kept alive: `keepPushSubscription()` on every open and return to the app (5 min throttle), for a device that opted in (`kf-push-on`, or an older opt-in found by its stored label) with permission still granted: subscribe again if missing, store the endpoint through the same save as Subscribe.
- ds baseline re-snapshot: the 23 "new" hits were existing literals whose line changed (floored at `--field-min`).

## Verification

- Gate: green — vitest ×4 TZ 194 files / 2704 tests each, lint 0, build ok, ds-check 0 new (baseline re-snapshot, see above), birthday_on 1/1.
- `docs/log/assets/ios-pwa/verify.mjs` (WebKit iPhone SE / 15 / 15 Pro Max + Chromium Pixel 7): **170/170** (`results.json`, screenshots beside it). Precache check on the production build: 148 entries, 2,592 KiB, no ds art, no non-latin fonts, no duplicates, the four tab pages in, Settings/Journal/Library out.
- Both harnesses take a playwright-core path as their last argument: the old default (omniroute's copy) is gone from this machine; I used playwright-core 1.61.1 (WebKit 26.5) installed in the session scratchpad.
- `docs/log/assets/ios-pwa/lighthouse.mjs`: mock production build, signed-in `/today` and `/sign-in`, a fresh Chrome per run, median of 3.
- Phone harnesses (port-9 mock server): phone-today 83/83, capture-type 100/100, kit-sheets 117/117, motion-chrome 163/163, notify-fix 26/26 (run from a copy with the playwright path swapped — its path is hard-coded and that install is gone), sounds 125/126, settings-sync 58/61. The sounds miss (today-top3 Goal → complete_big) and the three settings-sync "no page errors" (theme view-transition "Transition was skipped") fail identically on base bbc0a176 — pre-existing, not this branch. A first 3-lane run also missed motion-chrome o7/o8 under load; alone it was green.

## Kai's real-iPhone checklist (emulation can't see these)

1. Safari → kais-flow → the guide shows after a moment; Share → Add to Home Screen → Add. The label reads "Kai's Flow".
2. Open from the Home Screen: the launch screen shows the K on paper (Day) — set the phone to Dark, reopen: the night one.
3. Status bar: Day = paper colour, dark text; switch the app to Dark in Settings → Appearance: the bar goes night colour with light text **without** a relaunch. Then the system Dark/Light with the app on Auto.
4. Notch / Dynamic Island: nothing under it on Today (the Plan card, the Top 3 header), Calendar, Tasks, Inbox, Settings, Focus, Chat, a full sheet (More, expanded). The tab bar and + clear the home indicator; on a phone with no home indicator, 16px under the tab bar.
5. Settings → Notifications → Subscribe this device: the iOS prompt appears; Allow. Send a test notification. Then a real reminder: tap it → the task sheet opens on that task (also with the app fully closed).
6. Badge: the icon shows today's open count; tick them off → it clears at 0.
7. Chat (More → Chat): tap the field — the keyboard opens and the field and header stay in view; type, send.
8. The capture sheet with the keyboard up: its header stays on screen (F26).
9. Calendar: hold a block, then drag it to a new time (WebKit emulation lifts but can't move it).
10. Settings → About → This device → Storage says "Kept".
11. A deploy while typing a capture: nothing reloads until you've put the app away.
12. Optional: build the share Shortcut (Get Contents of URL → POST to the capture link with the key, Show in Share Sheet on) and send the iCloud link, so it can go in the guide.

## Housekeeping

- Every server started this session is stopped (5334, 5335, a base server on 5337 from a temporary worktree at bbc0a176 with its own `npm ci`, removed after; the Lighthouse runner closes its 5336/59999 itself). No node_modules links.
- D: ran out of space mid-session (0 bytes free, not from this work); a half-created comparison worktree was removed.
