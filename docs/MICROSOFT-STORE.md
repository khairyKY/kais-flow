# Kai's Flow in the Microsoft Store, for $0

Kai (2026-10-14): the Windows app goes into the **Microsoft Store**, so the SmartScreen screen
*"Windows protected your PC"* goes away. No paid code-signing certificate, no open-source signing program.

How: every release also builds **`kais-flow-<tag>.msix`**, an *unsigned* MSIX package of the same
Windows app. You upload it in Partner Center, and **the Store signs it itself** before shipping it.
People install from the Store with no warning, and the Store keeps the app up to date.

- The package is built by the `msix` job in `.github/workflows/desktop.yml`. Its manifest is
  `app/src-tauri/msix/AppxManifest.xml`.
- The app knows when it is the Store install (`store_install` in `app/src-tauri/src/tray.rs`). Then
  Settings → App says **"Updates come from the Microsoft Store"** and never offers the `.exe`.
- **Start with Windows** keeps working in the Store install. Windows lists it as "Kai's Flow" under
  Task Manager → Startup apps.
- The `.exe` installer on GitHub Releases stays as it is, for anyone who wants it.

---

## 1. Reserve the name (once, about 2 minutes)

1. Sign in at https://partner.microsoft.com/dashboard with your new developer account.
2. **Apps and games → + New product → MSIX or PWA app**.
3. Type the name **`Kai's Flow`** with a plain keyboard apostrophe `'`, not a curly `’`. It has to match the
   manifest's DisplayName exactly. Click **Check availability**, then **Reserve product name**.
   - If it's taken, reserve something close, like `Kai's Flow Planner`. Then tell Claude the exact name,
     because the manifest's `DisplayName` has to change to match it.

## 2. Copy the three identity values into GitHub (once, about 3 minutes)

1. In Partner Center open the app, then **Product management → Product identity**.
2. It shows these lines. Copy the three marked ones exactly as shown:
   - **Package/Identity/Name** → e.g. `12345KaiShaheen.KaisFlow`
   - **Package/Identity/Publisher** → e.g. `CN=1A2B3C4D-5E6F-7A8B-9C0D-1E2F3A4B5C6D` (the whole thing, `CN=` included)
   - **Package/Properties/PublisherDisplayName** → e.g. `Kai Shaheen`
   - Ignore the rest (Package Family Name, Package SID, Store ID). Keep the **Store ID** handy, though:
     the Store link is `https://apps.microsoft.com/detail/<Store ID>`.
3. Save them as **repository variables**. These are variables, not secrets: they appear in the public
   manifest of every Store app anyway. Pick one way:
   - **Terminal** (with the GitHub CLI, inside the kais-flow folder):
     ```
     gh variable set STORE_IDENTITY_NAME --body "12345KaiShaheen.KaisFlow"
     gh variable set STORE_PUBLISHER --body "CN=1A2B3C4D-5E6F-7A8B-9C0D-1E2F3A4B5C6D"
     gh variable set STORE_PUBLISHER_DISPLAY_NAME --body "Kai Shaheen"
     ```
   - **Browser:** https://github.com/khairyKY/kais-flow/settings/variables/actions → **New repository
     variable**, three times, with the same names and values.
4. Check: `gh variable list` shows all three.

Until all three exist, the `msix` job says *"No Microsoft Store package"* and skips. It stays green and
blocks nothing.

## 3. Get the .msix

- **From a release (the normal way):** the next release attaches `kais-flow-<tag>.msix` next to the
  `.exe`. Find it at https://github.com/khairyKY/kais-flow/releases → the newest release → **Assets**.
- **Right now, without a release:** https://github.com/khairyKY/kais-flow/actions/workflows/desktop.yml
  → **Run workflow** → when it's green, open the run → **Artifacts** → `kais-flow-msix` (a .zip with
  the .msix inside). Its version comes from `tauri.conf.json` (e.g. `1.0.0.0`), so later releases
  will always be higher.

**Don't double-click the .msix to install it.** Windows refuses unsigned packages, which is expected:
the Store signs it. The package's version is the release tag as `x.y.z.0` (`v1.1.7` → `1.1.7.0`). The
Store reserves the last number, and each upload must be higher than the one before.

## 4. The first submission (about 30 minutes, once)

In Partner Center, open the app → **Start your submission**. Fill in each section:

1. **Pricing and availability**
   - Markets: all.
   - Visibility: **Public audience**. Discoverability: anyone can find it.
   - Pricing: **Free**.
2. **Properties**
   - Category: **Productivity**.
   - Privacy policy URL: **https://kais-flow.kaidagoat.workers.dev/privacy**
   - Website: https://kais-flow.kaidagoat.workers.dev
   - Support contact: your email.
   - "Does this product access, collect, or transmit personal information?" **Yes**. Sign-in, tasks
     and journal are stored in your Supabase.
3. **Age ratings:** answer the questionnaire honestly (no violence, no gambling, user content
   isn't shared with other people). It usually lands at **3+ / Everyone**.
4. **Packages:** drag in **`kais-flow-<tag>.msix`**.
   - Partner Center checks it against the reserved identity. A red error about Name, Publisher or
     DisplayName means a repo variable doesn't match step 2. Fix the variable and rebuild.
   - Device families: **Windows 10/11 Desktop** only.
   - A warning about **restricted capabilities (runFullTrust)** is expected. Answer it in step 6.
5. **Store listings → English (United States)**
   - **Description**, e.g.: *Kai's Flow is the whole day in one calm place: an inbox for everything,
     today's plan, a calendar you plan on by dragging tasks onto it, routines, a journal and the people
     in your life. It works offline, sits in your tray, and syncs with the web and Android apps.*
   - **Screenshots** (at least 1, up to 10): PNG, at least 1366×768. In the Windows app, take them with
     **Win+Shift+S → Window**: Today, the calendar, the Inbox.
   - The rest (features, keywords, short description) is optional. The logos come from the package.
6. **Submission options**
   - **Restricted capabilities → runFullTrust**, the justification. Paste:
     > Kai's Flow is a desktop (Win32) application built with Tauri: a native window hosting the
     > system WebView2, a notification-area (tray) icon with its own menu and flyout window, Windows
     > toast notifications with action buttons, and an optional "Start with Windows" startup task.
     > These run as a normal desktop process and need full trust. The app doesn't install drivers or
     > services, and it doesn't change system settings.
   - **Notes for certification**. Microsoft's testers need to get past sign-in. Make a test account
     yourself (any spare email) and paste:
     > The app needs an account. Test account: <email> / <password>. It also opens offline after the
     > first sign-in. Tray icon: right-click for the menu, left-click for the flyout.
7. **Submit to the Store.** Certification usually takes 1 to 3 business days. Partner Center emails you
   when it's live or if something failed.

## 5. Each later update

When a release finishes:

1. Download `kais-flow-<tag>.msix` from the release's **Assets**.
2. Partner Center → the app → **Update** on the latest submission → **Packages**. Remove the old
   package, drop in the new one, and **Submit**. Every other section carries over.

That's it: people's Windows Store updates the app on its own.

**Automating it later (optional, not set up):** the Store submission API can upload each release's
package from `release.yml`. It needs an **Azure AD (Entra ID) app** linked to the Partner Center account
(Account settings → User management → Azure AD applications), plus its tenant ID, client ID and key stored
as GitHub secrets. That's free, but it's a one-time setup in the Azure portal, so it only becomes worth
it once uploading by hand gets tedious.

## Moving your own PC from the .exe to the Store version

The two are separate apps, so don't run both:

1. Open the old app and wait for **Synced**.
2. Uninstall it: Settings → Apps → Kai's Flow → Uninstall. Turn on **"Also forget this PC's sign-in
   and cache"**, then **Uproot**.
3. Install Kai's Flow from the Store and sign in. Everything comes back from the cloud. Turn **Start
   with Windows** on again in Settings if you had it on.

## Notes (for Claude)

- **What the package contains:**
  - `kais-flow.exe` from the same build as the `.exe` installer (Tauri embeds the web app, and the
    WebView2 loader is static).
  - The four logos `tauri icon` already made: `StoreLogo` 50, `Square44x44Logo`, `Square71x71Logo`,
    `Square150x150Logo`.
  - The filled manifest.
- **What `makeappx pack` checks:** the manifest against the schema. `makeappx unpack` then proves
  the file is a whole package.
- **WebView2:** Windows 11 has it built in, and Microsoft put it on Windows 10 through Windows Update.
  An MSIX can't run the bootstrapper the `.exe` installer carries. `MinVersion` is 10.0.19041 (Windows 10
  2004), the first build with `uap10:Parameters`, which passes `--minimized` to the startup task.
- **Packaged behaviour:**
  - Writes under `%APPDATA%` / `%LOCALAPPDATA%` (the WebView2 profile) go to the package's private
    copy. Windows removes them on uninstall.
  - HKCU writes are private too, which is why autostart uses the manifest's `StartupTask` and not the
    plugin's Run key.
  - Toasts use the package's own app id (`GetCurrentApplicationUserModelId`).
  - The tray and single-instance work unchanged.
- **Testing a package on a PC without the Store:** turn on Developer Mode, then
  `Add-AppxPackage -Register <unpacked folder>\AppxManifest.xml`. The 2026-10-14 CI dry run did exactly
  this and launched it with its package identity (`docs/log/2026-10-14-1445-msix-handoff.md`).
