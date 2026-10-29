// The app, outside the app (design-export/Tray and Notifications.dc.html 12a–12e) — desktop only.
//
// - The K by the clock (12a): one strip per taskbar theme and size, eight states side by side
//   (design-integration/render_tray_icons.mjs). The web app says which state (`tray_set`); the
//   strip size follows the main window's DPI so 100/125/150/200 % each get their own pixels.
// - Right-click (Calendar extras options.html §5, tray menu B): our own small menu window, `tray.html?menu`.
//   Its rows run here (`tray_menu_pick` → `menu_event`), then in the web app via `window.__kfTray(id)`.
//   The native menu (12d) stays built: it stands in when the menu window can't be made or hasn't drawn
//   within MENU_GRACE, so Open and Quit are always reachable.
// - Left-click (12b/12c, popover B): the flyout, a small borderless window on `tray.html`, above the
//   tray. Both windows hide on blur or Esc (`tray_hide`) and are kept warm once made.
// - Both windows load on the main window's scheme (`https`): on the other one they were another origin,
//   with their own storage and so no session (queue item 14a, "a signed-out window").
// - Closing the main window hides it to the tray while the tray is shown (Settings → Notifications
//   → Show in the system tray); otherwise it quits, as before.
// - Toasts (12e) with up to four buttons (`notify_local`; Windows allows five); a button runs `window.__kfNotifyAction`.
// - The Mac app (docs/log/2026-10-29-*-mac-app-handoff.md): the same K, in the menu bar; `anchor` already
//   opens down from a top bar. Its notices are Notification Center banners without buttons, and
//   "Start with Windows" is the plugin's LaunchAgent ("Open at login").
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{include_image, AppHandle, Builder, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const TRAY_ID: &str = "kf";
const FLYOUT: &str = "tray";
const FLYOUT_W: f64 = 340.0;
const FLYOUT_H: f64 = 480.0; // popover B: the Now card is taller than 12b's Next row
const MENU: &str = "traymenu";
const MENU_W: f64 = 250.0;
/// Until the menu page says how tall it is (`tray_menu_ready`): the signed-in list.
const MENU_H: f64 = 300.0;
/// How long a first right-click waits for the menu page before the native menu stands in.
const MENU_GRACE: Duration = Duration::from_millis(1500);
/// A click on the K that blurred a window closed must not reopen it.
const REOPEN_GUARD: Duration = Duration::from_millis(300);
/// The menu page's state before the app says otherwise (`tray_menu`): Open and Quit only.
const SIGNED_OUT: &str = r#"{"signedIn":false}"#;
/// Must match render_tray_icons.mjs STATES.
const STATES: [&str; 8] = ["normal", "focus1", "focus2", "focus3", "focus4", "needs", "offline", "quiet"];
/// Launched by "Start with Windows": open quietly to the tray.
const MINIMIZED: &str = "--minimized";
/// The Store install's StartupTask (msix/AppxManifest.xml TaskId), which also passes MINIMIZED.
#[cfg(windows)]
const STARTUP_TASK: &str = "KaisFlowStartup";

struct TrayLook {
    state: String,
    dark: bool,
    /// Settings → Show in the system tray. Off = no K, and closing the window quits.
    shown: bool,
}

struct Tray {
    focus: MenuItem<Wry>,
    pause: MenuItem<Wry>,
    look: Mutex<TrayLook>,
    /// When blur last hid the flyout — a click on the K that caused that blur must not reopen it.
    hidden_at: Mutex<Option<Instant>>,
    menu: Mutex<MenuWin>,
}

/// The right-click menu window (tray menu B).
struct MenuWin {
    /// tray-icon's own right-click menu is off, so right-click is ours. If that failed, Windows'
    /// native menu shows by itself, as before, and ours never opens.
    custom: bool,
    /// The page has drawn and said how tall it is.
    ready: bool,
    height: f64,
    /// A first right-click waiting for the page: where the pointer was (physical px).
    pending: Option<PhysicalPosition<f64>>,
    hidden_at: Option<Instant>,
    /// The web app's JSON for the page (`tray_menu`): signed in, what's next, notifications paused.
    state: String,
}

fn strip(dark: bool, px: u32) -> Image<'static> {
    match (dark, px) {
        (false, 16) => include_image!("icons/tray/tray-light-16.png"),
        (false, 20) => include_image!("icons/tray/tray-light-20.png"),
        (false, 24) => include_image!("icons/tray/tray-light-24.png"),
        (false, _) => include_image!("icons/tray/tray-light-32.png"),
        (true, 16) => include_image!("icons/tray/tray-dark-16.png"),
        (true, 20) => include_image!("icons/tray/tray-dark-20.png"),
        (true, 24) => include_image!("icons/tray/tray-dark-24.png"),
        (true, _) => include_image!("icons/tray/tray-dark-32.png"),
    }
}

/// One state's square out of its strip.
fn frame(dark: bool, px: u32, state: &str) -> Image<'static> {
    let i = STATES.iter().position(|s| *s == state).unwrap_or(0);
    let s = strip(dark, px);
    let (w, h) = (s.width() as usize, s.height() as usize);
    let mut rgba = Vec::with_capacity(h * h * 4);
    for y in 0..h {
        let start = (y * w + i * h) * 4;
        rgba.extend_from_slice(&s.rgba()[start..start + h * 4]);
    }
    Image::new_owned(rgba, h as u32, h as u32)
}

/// The tray slot is 16 px at 100 %. ponytail: the main window's scale stands in for the taskbar's
/// monitor; a taskbar on a second screen with another scale gets the nearest strip, scaled by Windows.
fn tray_px(app: &AppHandle) -> u32 {
    let scale = app.get_webview_window("main").and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);
    [16, 20, 24, 32].into_iter().find(|&p| p as f64 >= 16.0 * scale - 0.5).unwrap_or(32)
}

fn redraw(app: &AppHandle) {
    let (Some(tray), Some(t)) = (app.tray_by_id(TRAY_ID), app.try_state::<Tray>()) else { return };
    let look = t.look.lock().unwrap();
    let _ = tray.set_icon(Some(frame(look.dark, tray_px(app), &look.state)));
    let _ = tray.set_visible(look.shown);
}

/// Runs `window.<f>(<arg>)` in the main window, if the app has installed it.
fn call_main(app: &AppHandle, f: &str, arg: &str) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.eval(format!("window.{f}&&window.{f}({arg})"));
    }
}

fn hide(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.hide();
    }
}

pub(crate) fn show_main(app: &AppHandle) {
    hide(app, FLYOUT);
    hide(app, MENU);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/// The main window's scheme (tauri.conf.json `useHttpsScheme`). A window on the other scheme is
/// another origin — its own localStorage and IndexedDB, so no session (item 14a): every window we
/// make here must use this.
fn https(app: &AppHandle) -> bool {
    app.config().app.windows.iter().find(|w| w.label == "main").is_some_and(|w| w.use_https_scheme)
}

/// A tray window: borderless, on top, off the taskbar, hidden until placed; `tray.html` + `query`.
fn tray_window(app: &AppHandle, label: &str, query: &str, w: f64, h: f64) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(format!("tray.html{query}").into()))
        .use_https_scheme(https(app))
        .title("Kai’s Flow")
        .inner_size(w, h)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
}

/// Top-left for a `size` window (physical px) near `at`: centred on it (the flyout over the K) or with
/// its left edge there, flipped left when that runs off (the menu at the pointer); above a bottom
/// taskbar, below a top one; always inside the work area `(left, top, right, bottom)`. Pure, tested below.
fn anchor(at: (f64, f64), size: (f64, f64), area: (f64, f64, f64, f64), gap: f64, centred: bool) -> (i32, i32) {
    let ((x, y), (w, h), (left, top, right, bottom)) = (at, size, area);
    let x = if centred { x - w / 2.0 } else if x + w > right - gap { x - w } else { x };
    // max/min, not clamp: clamp panics when the work area is smaller than the window (panic = abort).
    let x = x.min(right - w - gap).max(left + gap);
    let y = if y > (top + bottom) / 2.0 { y.min(bottom - gap) - h } else { y.max(top + gap) };
    let y = y.min(bottom - h - gap).max(top + gap);
    (x.round() as i32, y.round() as i32)
}

/// Sizes and places a tray window on the monitor under `at` (physical px), `w`×`h` logical — so
/// 100/125/150 % each get their own pixels. Placed twice: moving onto a monitor with another scale
/// makes Windows resize it (WM_DPICHANGED), which can shift it.
fn place(app: &AppHandle, win: &WebviewWindow, at: (f64, f64), (w, h): (f64, f64), gap: f64, centred: bool) {
    let Some(monitor) = app.monitor_from_point(at.0, at.1).ok().flatten() else { return };
    let s = monitor.scale_factor();
    let a = monitor.work_area();
    let (l, t) = (a.position.x as f64, a.position.y as f64);
    let area = (l, t, l + a.size.width as f64, t + a.size.height as f64);
    let size = (w * s, h * s);
    let (x, y) = anchor(at, size, area, gap * s, centred);
    let _ = win.set_position(PhysicalPosition::new(x, y));
    let _ = win.set_size(PhysicalSize::new(size.0.round() as u32, size.1.round() as u32));
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

fn toggle_flyout(app: &AppHandle, at: (f64, f64)) {
    hide(app, MENU);
    if let Some(flyout) = app.get_webview_window(FLYOUT) {
        if flyout.is_visible().unwrap_or(false) {
            let _ = flyout.hide();
            return;
        }
    }
    let just_hidden = app.try_state::<Tray>().is_some_and(|t| t.hidden_at.lock().unwrap().is_some_and(|at| at.elapsed() < REOPEN_GUARD));
    if just_hidden {
        return; // this click is what blurred it closed
    }
    let flyout = match app.get_webview_window(FLYOUT) {
        Some(w) => w,
        None => match tray_window(app, FLYOUT, "", FLYOUT_W, FLYOUT_H) {
            Ok(w) => w,
            Err(_) => return,
        },
    };
    place(app, &flyout, at, (FLYOUT_W, FLYOUT_H), 12.0, true);
    let _ = flyout.show();
    let _ = flyout.set_focus();
    call_main(app, "__kfTray", "'seen'");
}

/// Windows' own menu (12d) — when ours can't open. tray-icon pops it above the K, in the foreground.
fn native_menu(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.with_inner_tray_icon(|t| t.show_menu());
    }
}

fn show_menu_at(app: &AppHandle, at: PhysicalPosition<f64>) {
    let (Some(t), Some(win)) = (app.try_state::<Tray>(), app.get_webview_window(MENU)) else { return };
    let h = t.menu.lock().unwrap().height;
    place(app, &win, (at.x, at.y), (MENU_W, h), 6.0, false);
    let _ = win.show();
    let _ = win.set_focus();
}

/// Right-click: our menu at the pointer. Made on the first right-click and kept warm; that first one
/// waits for the page to draw (`tray_menu_ready`), up to MENU_GRACE, then the native menu stands in.
fn open_menu(app: &AppHandle, at: PhysicalPosition<f64>) {
    let Some(t) = app.try_state::<Tray>() else { return };
    hide(app, FLYOUT);
    let win = app.get_webview_window(MENU);
    if win.as_ref().is_some_and(|w| w.is_visible().unwrap_or(false)) {
        return hide(app, MENU);
    }
    {
        let mut m = t.menu.lock().unwrap();
        if m.hidden_at.is_some_and(|h| h.elapsed() < REOPEN_GUARD) {
            return; // this click is what blurred it closed
        }
        if m.ready {
            drop(m);
            return show_menu_at(app, at);
        }
        if win.is_some() {
            drop(m);
            return native_menu(app); // made but never drew: don't keep the pointer waiting
        }
        m.pending = Some(at);
    }
    if tray_window(app, MENU, "?menu", MENU_W, MENU_H).is_err() {
        t.menu.lock().unwrap().pending = None;
        return native_menu(app);
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(MENU_GRACE);
        let late = app.try_state::<Tray>().is_some_and(|t| t.menu.lock().unwrap().pending.take().is_some());
        if late {
            native_menu(&app);
        }
    });
}

fn menu_event(app: &AppHandle, id: &str) {
    match id {
        "open" => show_main(app),
        "quit" => app.exit(0),
        // Start/stop focus and pause run where they are; capture and settings need the window.
        "focus" | "pause" | "resume" => call_main(app, "__kfTray", &format!("{id:?}")),
        _ if id.starts_with("pause:") => call_main(app, "__kfTray", &format!("{id:?}")),
        _ => {
            show_main(app);
            call_main(app, "__kfTray", &format!("{id:?}"));
        }
    }
}

fn tray_event(tray: &TrayIcon, event: TrayIconEvent) {
    let app = tray.app_handle();
    match event {
        TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect, .. } => {
            let (p, s) = (rect.position.to_physical::<f64>(1.0), rect.size.to_physical::<f64>(1.0));
            toggle_flyout(app, (p.x + s.width / 2.0, p.y + s.height / 2.0));
        }
        TrayIconEvent::Click { button: MouseButton::Right, button_state: MouseButtonState::Up, position, .. } => {
            if app.try_state::<Tray>().is_some_and(|t| t.menu.lock().unwrap().custom) {
                open_menu(app, position);
            }
        }
        TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => show_main(app),
        _ => {}
    }
}

/// The web app's tray state: which icon, the taskbar theme, and the two menu rows that change
/// ("Start focus · 25:00" / "Stop focus — 18:42 left", "Pause notifications for 1 hour" /
/// "Resume notifications — paused until 10:41").
#[tauri::command]
fn tray_set(app: AppHandle, state: String, dark: bool, focus_label: String, pause_label: String) {
    if let Some(t) = app.try_state::<Tray>() {
        let _ = t.focus.set_text(focus_label);
        let _ = t.pause.set_text(pause_label);
        let mut look = t.look.lock().unwrap();
        look.state = if STATES.contains(&state.as_str()) { state } else { "normal".into() };
        look.dark = dark;
    }
    redraw(&app);
}

/// Settings → Show in the system tray.
#[tauri::command]
fn tray_shown(app: AppHandle, shown: bool) {
    if let Some(t) = app.try_state::<Tray>() {
        t.look.lock().unwrap().shown = shown;
    }
    redraw(&app);
}

/// The flyout's "Open Kai's Flow" / Settings / a row: show the main window at `route`.
#[tauri::command]
fn tray_open(app: AppHandle, route: Option<String>) {
    show_main(&app);
    if let Some(route) = route {
        call_main(&app, "__kfTray", &format!("{{open:{route:?}}}"));
    }
}

/// Esc in the flyout or the menu: hides the window that asked.
#[tauri::command]
fn tray_hide(window: WebviewWindow) {
    let _ = window.hide();
}

/// The web app's state for the menu page (TrayBridge, JSON it writes and reads — not parsed here):
/// kept for the page's first draw and handed to it live while it's made.
#[tauri::command]
fn tray_menu(app: AppHandle, menu: String) {
    let Some(t) = app.try_state::<Tray>() else { return };
    t.menu.lock().unwrap().state = menu.clone();
    if let Some(win) = app.get_webview_window(MENU) {
        let _ = win.eval(format!("window.__kfMenu&&window.__kfMenu({menu})"));
    }
}

/// The menu page, before its first draw.
#[tauri::command]
fn tray_menu_state(app: AppHandle) -> String {
    app.try_state::<Tray>().map_or_else(|| SIGNED_OUT.into(), |t| t.menu.lock().unwrap().state.clone())
}

/// The menu page has drawn, `height` logical px tall: show it if a right-click is waiting.
#[tauri::command]
fn tray_menu_ready(app: AppHandle, height: f64) {
    let Some(t) = app.try_state::<Tray>() else { return };
    let pending = {
        let mut m = t.menu.lock().unwrap();
        m.ready = true;
        m.height = height;
        m.pending.take()
    };
    if let Some(at) = pending {
        show_menu_at(&app, at);
    }
}

/// The menu's rows changed (signed in or out, paused): its new height, for the next time it opens.
#[tauri::command]
fn tray_menu_size(app: AppHandle, height: f64) {
    if let Some(t) = app.try_state::<Tray>() {
        t.menu.lock().unwrap().height = height;
    }
    if let Some(win) = app.get_webview_window(MENU).filter(|w| w.is_visible().unwrap_or(false)) {
        let _ = win.set_size(tauri::LogicalSize::new(MENU_W, height));
    }
}

/// A row of the menu page: the same ids as the native menu's, plus `resume` and `pause:<choice>`.
#[tauri::command]
fn tray_menu_pick(app: AppHandle, id: String) {
    hide(&app, MENU);
    menu_event(&app, &id);
}

/// The Microsoft Store install's app id (`<package family>!App`, docs/MICROSOFT-STORE.md); None for
/// the .exe install. Only an MSIX-packaged app has one.
#[cfg(windows)]
fn store_app_id() -> Option<String> {
    use windows::Win32::Storage::Packaging::Appx::GetCurrentApplicationUserModelId;
    let mut buf = [0u16; 130]; // APPLICATION_USER_MODEL_ID_MAX_LENGTH
    let mut len = buf.len() as u32;
    // ERROR_SUCCESS (0), or APPMODEL_ERROR_NO_APPLICATION for an unpackaged process.
    let ok = unsafe { GetCurrentApplicationUserModelId(&mut len, Some(windows::core::PWSTR(buf.as_mut_ptr()))) }.0 == 0;
    ok.then(|| String::from_utf16_lossy(&buf[..(len as usize).saturating_sub(1)]))
}
#[cfg(not(windows))]
fn store_app_id() -> Option<String> {
    None
}

/// Settings → App: the Store keeps this install up to date, so it never offers the .exe (appUpdate.ts).
#[tauri::command]
fn store_install() -> bool {
    store_app_id().is_some()
}

/// The Store install's "Start with Windows" is the manifest's StartupTask (msix/AppxManifest.xml): the
/// plugin's Run key would land in the package's private registry, which Windows never reads at sign-in.
/// None = the .exe install (the plugin answers). `set` turns it on or off first; the answer is its state.
#[cfg(windows)]
fn store_autostart(set: Option<bool>) -> Option<bool> {
    use windows::ApplicationModel::{StartupTask, StartupTaskState as S};
    store_app_id()?;
    let Some(task) = StartupTask::GetAsync(&STARTUP_TASK.into()).and_then(|op| op.join()).ok() else { return Some(false) };
    match set {
        // A desktop app isn't asked; a task the user turned off in Task Manager stays off.
        Some(true) => {
            let _ = task.RequestEnableAsync().and_then(|op| op.join());
        }
        Some(false) => {
            let _ = task.Disable();
        }
        None => {}
    }
    Some(task.State().is_ok_and(|s| s == S::Enabled || s == S::EnabledByPolicy))
}
#[cfg(not(windows))]
fn store_autostart(_: Option<bool>) -> Option<bool> {
    None
}

// async: off the main thread, since the Store install's StartupTask calls wait on Windows.
#[tauri::command]
async fn autostart_get(app: AppHandle) -> bool {
    store_autostart(None).unwrap_or_else(|| app.autolaunch().is_enabled().unwrap_or(false))
}

#[tauri::command]
async fn autostart_set(app: AppHandle, on: bool) -> bool {
    if let Some(on) = store_autostart(Some(on)) {
        return on;
    }
    let manager = app.autolaunch();
    let _ = if on { manager.enable() } else { manager.disable() };
    manager.is_enabled().unwrap_or(false)
}

/// A Windows toast in the app's voice (12e): title, one body line, up to four buttons (a reminder:
/// Done · In 10 min · In 1 hour · Tomorrow)
/// (`actions` = [[id, label]…]). A button calls `window.__kfNotifyAction(id, payload)` in the main
/// window; a click on the toast itself opens the app. `payload` is the web app's own JSON.
#[tauri::command]
fn notify_local(app: AppHandle, title: String, body: String, actions: Vec<[String; 2]>, silent: bool, payload: String) {
    #[cfg(windows)]
    {
        use tauri_winrt_notification::{Sound, Toast};
        // The installer registers the app under its identifier, the Store install has its package's
        // own id; a dev build has neither.
        let id = if tauri::is_dev() { Toast::POWERSHELL_APP_ID.to_string() } else { store_app_id().unwrap_or_else(|| app.config().identifier.clone()) };
        let mut toast = Toast::new(&id).title(&title).text1(&body).sound(if silent { None } else { Some(Sound::Default) });
        for [action, label] in actions.iter().take(4) {
            toast = toast.add_button(label, action);
        }
        let handle = app.clone();
        let _ = toast
            .on_activated(move |action| {
                match action {
                    Some(action) => call_main(&handle, "__kfNotifyAction", &format!("{action:?},{payload}")),
                    None => show_main(&handle),
                }
                Ok(())
            })
            .show();
    }
    // ponytail: a banner with no buttons (mac-notification-sys only reports a button press by blocking
    // a thread per notice); a click on it brings the app forward. Buttons when someone misses them.
    #[cfg(target_os = "macos")]
    {
        // Without this the banner comes from Finder: the crate's default app. Set once; later calls say AlreadySet.
        let _ = mac_notification_sys::set_application(&app.config().identifier);
        let mut n = mac_notification_sys::Notification::new();
        if !silent {
            n.default_sound();
        }
        let _ = mac_notification_sys::send_notification(&title, None, &body, Some(&n));
        let _ = (actions, payload);
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = (app, title, body, actions, silent, payload);
}

/// The Mac app after an in-place update (appUpdate.ts installUpdate): the updater has swapped the .app
/// on disk but, unlike the Windows installer, doesn't reopen it.
#[tauri::command]
fn app_restart(app: AppHandle) {
    app.restart()
}

pub fn install(builder: Builder<Wry>) -> Builder<Wry> {
    builder
        // First: a second launch (Start menu, a shortcut) brings this one forward instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![MINIMIZED])))
        .invoke_handler(tauri::generate_handler![
            tray_set,
            tray_shown,
            tray_open,
            tray_hide,
            tray_menu,
            tray_menu_state,
            tray_menu_ready,
            tray_menu_size,
            tray_menu_pick,
            autostart_get,
            autostart_set,
            store_install,
            notify_local,
            app_restart
        ])
        .setup(|app| {
            let h = app.handle();
            let item = |id: &str, text: &str| MenuItem::with_id(h, id, text, true, None::<&str>);
            let focus = item("focus", "Start focus · 25:00")?;
            let pause = item("pause", "Pause notifications for 1 hour")?;
            let menu = Menu::with_items(
                h,
                &[
                    &item("open", "Open Kai’s Flow")?,
                    &item("capture", "Quick capture…")?,
                    &PredefinedMenuItem::separator(h)?,
                    &focus,
                    &pause,
                    &PredefinedMenuItem::separator(h)?,
                    &item("settings", "Settings")?,
                    &item("quit", "Quit Kai’s Flow")?,
                ],
            )?;
            let tray = TrayIconBuilder::with_id(TRAY_ID)
                .icon(frame(false, tray_px(h), "normal"))
                .tooltip("Kai’s Flow")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| menu_event(app, e.id().as_ref()))
                .on_tray_icon_event(tray_event)
                .build(app)?;
            // Right-click is our menu window from here; the native menu stays attached for native_menu.
            let custom = tray.with_inner_tray_icon(|t| t.set_show_menu_on_right_click(false)).is_ok();
            app.manage(Tray {
                focus,
                pause,
                look: Mutex::new(TrayLook { state: "normal".into(), dark: false, shown: true }),
                hidden_at: Mutex::new(None),
                menu: Mutex::new(MenuWin { custom, ready: false, height: MENU_H, pending: None, hidden_at: None, state: SIGNED_OUT.into() }),
            });
            // tauri.conf.json starts the window hidden, so a start-up launch stays in the tray.
            if !std::env::args().any(|a| a == MINIMIZED) {
                show_main(h);
            }
            Ok(())
        })
        .on_window_event(|window, event| match (window.label(), event) {
            ("main", WindowEvent::CloseRequested { api, .. }) => {
                let keep = window.app_handle().try_state::<Tray>().is_some_and(|t| t.look.lock().unwrap().shown);
                if keep {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            (FLYOUT, WindowEvent::Focused(false)) => {
                if let Some(t) = window.app_handle().try_state::<Tray>() {
                    *t.hidden_at.lock().unwrap() = Some(Instant::now());
                }
                let _ = window.hide();
            }
            (MENU, WindowEvent::Focused(false)) => {
                if let Some(t) = window.app_handle().try_state::<Tray>() {
                    t.menu.lock().unwrap().hidden_at = Some(Instant::now());
                }
                let _ = window.hide();
            }
            ("main", WindowEvent::ScaleFactorChanged { .. }) => redraw(window.app_handle()),
            _ => {}
        })
}

#[cfg(test)]
mod tests {
    use super::anchor;

    const FHD: (f64, f64, f64, f64) = (0.0, 0.0, 1920.0, 1032.0); // 1920×1080, a 48 px taskbar at the bottom

    #[test]
    fn flyout_sits_centred_over_the_k_above_the_taskbar() {
        assert_eq!(anchor((1700.0, 1056.0), (340.0, 460.0), FHD, 12.0, true), (1530, 560));
    }

    #[test]
    fn scales_with_the_monitor() {
        // 150 %: the same screen in physical px, the window and the gap ×1.5.
        let area = (0.0, 0.0, 2880.0, 1548.0);
        assert_eq!(anchor((2550.0, 1584.0), (510.0, 690.0), area, 18.0, true), (2295, 840));
        // 125 %
        let area = (0.0, 0.0, 2400.0, 1290.0);
        assert_eq!(anchor((2125.0, 1320.0), (425.0, 575.0), area, 15.0, true), (1913, 700));
    }

    #[test]
    fn stays_on_screen_at_the_right_edge() {
        assert_eq!(anchor((1900.0, 1056.0), (340.0, 460.0), FHD, 12.0, true), (1568, 560));
    }

    #[test]
    fn opens_down_from_a_top_taskbar() {
        assert_eq!(anchor((1700.0, 24.0), (340.0, 460.0), (0.0, 48.0, 1920.0, 1080.0), 12.0, true), (1530, 60));
    }

    #[test]
    fn menu_opens_at_the_pointer_and_flips_left_near_the_edge() {
        assert_eq!(anchor((1000.0, 1060.0), (250.0, 300.0), FHD, 6.0, false), (1000, 726));
        assert_eq!(anchor((1700.0, 1060.0), (250.0, 300.0), FHD, 6.0, false), (1450, 726));
    }

    #[test]
    fn menu_on_a_second_monitor_left_of_the_main_one() {
        assert_eq!(anchor((-200.0, 1060.0), (250.0, 300.0), (-1920.0, 0.0, 0.0, 1040.0), 6.0, false), (-450, 734));
    }

    #[test]
    fn never_panics_when_the_work_area_is_smaller_than_the_window() {
        assert_eq!(anchor((150.0, 480.0), (340.0, 460.0), (0.0, 0.0, 300.0, 400.0), 12.0, true), (12, 12));
    }
}
