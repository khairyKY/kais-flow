// The app, outside the app (design-export/Tray and Notifications.dc.html 12a–12e) — desktop only.
//
// - The K by the clock (12a): one strip per taskbar theme and size, eight states side by side
//   (design-integration/render_tray_icons.mjs). The web app says which state (`tray_set`); the
//   strip size follows the main window's DPI so 100/125/150/200 % each get their own pixels.
// - Right-click (12d): a native menu. Its actions run in the web app via `window.__kfTray(id)`.
// - Left-click (12b/12c): the flyout, a small borderless window on the `/tray` route of the same
//   app, above the tray. It hides on blur or Esc (`tray_hide`).
// - Closing the main window hides it to the tray while the tray is shown (Settings → Notifications
//   → Show in the system tray); otherwise it quits, as before.
// - Toasts (12e) with up to two buttons (`notify_local`); a button runs `window.__kfNotifyAction`.
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{include_image, AppHandle, Builder, Manager, PhysicalPosition, Rect, WebviewUrl, WebviewWindowBuilder, WindowEvent, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const TRAY_ID: &str = "kf";
const FLYOUT: &str = "tray";
const FLYOUT_W: f64 = 340.0;
const FLYOUT_H: f64 = 460.0;
/// Must match render_tray_icons.mjs STATES.
const STATES: [&str; 8] = ["normal", "focus1", "focus2", "focus3", "focus4", "needs", "offline", "quiet"];
/// Launched by "Start with Windows": open quietly to the tray.
const MINIMIZED: &str = "--minimized";

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

fn show_main(app: &AppHandle) {
    if let Some(flyout) = app.get_webview_window(FLYOUT) {
        let _ = flyout.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/// Where the flyout sits: centred over the K, above a bottom taskbar (below a top one), inside the
/// work area. Everything in physical pixels.
fn place(app: &AppHandle, rect: &Rect) -> Option<(PhysicalPosition<i32>, f64)> {
    let at = rect.position.to_physical::<f64>(1.0);
    let size = rect.size.to_physical::<f64>(1.0);
    let monitor = app.monitor_from_point(at.x, at.y).ok().flatten()?;
    let scale = monitor.scale_factor();
    let (w, h, gap) = (FLYOUT_W * scale, FLYOUT_H * scale, 12.0 * scale);
    let area = monitor.work_area();
    let (left, top) = (area.position.x as f64, area.position.y as f64);
    let (right, bottom) = (left + area.size.width as f64, top + area.size.height as f64);
    // max/min, not clamp: clamp panics when the work area is narrower than the card (panic = abort).
    let x = (at.x + size.width / 2.0 - w / 2.0).min(right - w - gap).max(left + gap);
    let above = at.y > top + (bottom - top) / 2.0;
    let y = if above { bottom - h - gap } else { top + gap };
    Some((PhysicalPosition::new(x.round() as i32, y.round() as i32), scale))
}

fn toggle_flyout(app: &AppHandle, rect: &Rect) {
    if let Some(flyout) = app.get_webview_window(FLYOUT) {
        if flyout.is_visible().unwrap_or(false) {
            let _ = flyout.hide();
            return;
        }
    }
    let just_hidden = app.try_state::<Tray>().is_some_and(|t| t.hidden_at.lock().unwrap().is_some_and(|at| at.elapsed() < Duration::from_millis(300)));
    if just_hidden {
        return; // this click is what blurred it closed
    }
    let flyout = match app.get_webview_window(FLYOUT) {
        Some(w) => w,
        None => match WebviewWindowBuilder::new(app, FLYOUT, WebviewUrl::App("tray".into()))
            .title("Kai’s Flow")
            .inner_size(FLYOUT_W, FLYOUT_H)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .build()
        {
            Ok(w) => w,
            Err(_) => return,
        },
    };
    if let Some((pos, _)) = place(app, rect) {
        let _ = flyout.set_position(pos);
    }
    let _ = flyout.show();
    let _ = flyout.set_focus();
    call_main(app, "__kfTray", "'seen'");
}

fn menu_event(app: &AppHandle, id: &str) {
    match id {
        "open" => show_main(app),
        "quit" => app.exit(0),
        // Start/stop focus and pause run where they are; capture and settings need the window.
        "focus" | "pause" => call_main(app, "__kfTray", &format!("{id:?}")),
        _ => {
            show_main(app);
            call_main(app, "__kfTray", &format!("{id:?}"));
        }
    }
}

fn tray_event(tray: &TrayIcon, event: TrayIconEvent) {
    let app = tray.app_handle();
    match event {
        TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect, .. } => toggle_flyout(app, &rect),
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

/// The flyout's Esc.
#[tauri::command]
fn tray_hide(app: AppHandle) {
    if let Some(flyout) = app.get_webview_window(FLYOUT) {
        let _ = flyout.hide();
    }
}

#[tauri::command]
fn autostart_get(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn autostart_set(app: AppHandle, on: bool) -> bool {
    let manager = app.autolaunch();
    let _ = if on { manager.enable() } else { manager.disable() };
    manager.is_enabled().unwrap_or(false)
}

/// A Windows toast in the app's voice (12e): title, one body line, up to two buttons
/// (`actions` = [[id, label]…]). A button calls `window.__kfNotifyAction(id, payload)` in the main
/// window; a click on the toast itself opens the app. `payload` is the web app's own JSON.
#[tauri::command]
fn notify_local(app: AppHandle, title: String, body: String, actions: Vec<[String; 2]>, silent: bool, payload: String) {
    #[cfg(windows)]
    {
        use tauri_winrt_notification::{Sound, Toast};
        // The installer registers the app under its identifier; a dev build has no such entry.
        let id = if tauri::is_dev() { Toast::POWERSHELL_APP_ID.to_string() } else { app.config().identifier.clone() };
        let mut toast = Toast::new(&id).title(&title).text1(&body).sound(if silent { None } else { Some(Sound::Default) });
        for [action, label] in actions.iter().take(2) {
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
    #[cfg(not(windows))]
    let _ = (app, title, body, actions, silent, payload);
}

pub fn install(builder: Builder<Wry>) -> Builder<Wry> {
    builder
        // First: a second launch (Start menu, a shortcut) brings this one forward instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![MINIMIZED])))
        .invoke_handler(tauri::generate_handler![tray_set, tray_shown, tray_open, tray_hide, autostart_get, autostart_set, notify_local])
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
            app.manage(Tray {
                focus,
                pause,
                look: Mutex::new(TrayLook { state: "normal".into(), dark: false, shown: true }),
                hidden_at: Mutex::new(None),
            });
            TrayIconBuilder::with_id(TRAY_ID)
                .icon(frame(false, tray_px(h), "normal"))
                .tooltip("Kai’s Flow")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| menu_event(app, e.id().as_ref()))
                .on_tray_icon_event(tray_event)
                .build(app)?;
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
            ("main", WindowEvent::ScaleFactorChanged { .. }) => redraw(window.app_handle()),
            _ => {}
        })
}
