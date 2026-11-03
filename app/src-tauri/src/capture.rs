// The app's two doors from outside — desktop only.
//
// - Quick capture (Akiflow's global popup): a system-wide shortcut opens a small borderless window over
//   whatever is in front, the app's ⌘K bar (`tray.html?capture`, features/tray/CapturePopup.tsx) on its
//   own — it works while the main window is hidden in the tray. Esc, a click away or a filed line hide it
//   (kept warm once made, like the tray's windows). The default is Ctrl+Shift+K (⌘⇧K): a GLOBAL Ctrl+K
//   would take Ctrl+K from every browser, Slack and editor. Settings → Desktop → Quick capture shortcut
//   changes it (`capture_shortcut`; Ctrl+K is one of the choices); inside the app Ctrl+K works as ever.
// - Deep links: `kaisflow://today | calendar | task/<id> | focus | capture`. A link — from a second launch
//   (single-instance passes its arguments here), from the OS while we run (tauri-plugin-deep-link, the
//   Mac's Apple event), or the one that started us — shows the app and leaves the link for the web app to
//   navigate (`deep_link_take`; features/tray/deepLink.ts maps it to a route). `capture` opens the popup.
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::tray::{call_main, hide, show_main, tray_window, FLYOUT, MENU};

pub(crate) const CAPTURE: &str = "capture";
const W: f64 = 520.0;
/// Until the page says how tall the bar is (`capture_size`): a field and its hint row.
const H: f64 = 120.0;
/// How long a first press waits for the page before the old way (the bar in the main window) stands in.
const GRACE: Duration = Duration::from_secs(4);
/// The shortcut until Settings says otherwise (the web app sends its choice when it starts).
pub(crate) const DEFAULT_ACCEL: &str = "CommandOrControl+Shift+K";

pub(crate) struct Capture(Mutex<State>);

struct State {
    /// The page has drawn and can be shown.
    ready: bool,
    /// A press is waiting for the page.
    pending: bool,
    height: f64,
    /// The shortcut that is registered now.
    accel: Option<String>,
    /// A deep link the web app hasn't taken yet.
    link: Option<String>,
}

impl Capture {
    pub(crate) fn new() -> Self {
        Capture(Mutex::new(State { ready: false, pending: false, height: H, accel: None, link: None }))
    }
}

fn state(app: &AppHandle) -> Option<tauri::State<'_, Capture>> {
    app.try_state::<Capture>()
}

/// Top-left (physical px) of a `size` window across the top of a work area `(left, top, right, bottom)`:
/// centred, a fifth of the way down, always inside it. Pure, tested below.
fn top_left(area: (f64, f64, f64, f64), size: (f64, f64)) -> (i32, i32) {
    let (left, top, right, bottom) = area;
    // min/max, not clamp: clamp panics when the area is smaller than the window (panic = abort).
    let x = (left + (right - left - size.0) / 2.0).min(right - size.0).max(left);
    let y = (top + (bottom - top) * 0.2).min(bottom - size.1).max(top);
    (x.round() as i32, y.round() as i32)
}

fn run_in(win: &WebviewWindow, js: &str) {
    let _ = win.eval(js);
}

/// On the monitor the pointer is on, then shown and focused; the page opens its bar.
fn show(app: &AppHandle) {
    let (Some(win), Some(st)) = (app.get_webview_window(CAPTURE), state(app)) else { return };
    hide(app, FLYOUT);
    hide(app, MENU);
    let h = st.0.lock().unwrap().height;
    let at = app.cursor_position().ok();
    let monitor = at.and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten()).or_else(|| app.primary_monitor().ok().flatten());
    if let Some(m) = monitor {
        let s = m.scale_factor();
        let a = m.work_area();
        let (l, t) = (a.position.x as f64, a.position.y as f64);
        let size = (W * s, h * s);
        let (x, y) = top_left((l, t, l + a.size.width as f64, t + a.size.height as f64), size);
        // Placed twice: moving onto a monitor with another scale makes Windows resize it (WM_DPICHANGED).
        let _ = win.set_position(PhysicalPosition::new(x, y));
        let _ = win.set_size(PhysicalSize::new(size.0.round() as u32, size.1.round() as u32));
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
    let _ = win.show();
    let _ = win.set_focus();
    run_in(&win, "window.__kfCapture&&window.__kfCapture(true)");
}

/// The shortcut, the tray's "Quick capture…" and `kaisflow://capture`. `toggle`: the shortcut closes
/// what it opened; a link only ever opens (a cold start can hand us the same link twice).
pub(crate) fn open(app: &AppHandle, toggle: bool) {
    let Some(st) = state(app) else { return };
    let existing = app.get_webview_window(CAPTURE);
    if let Some(win) = &existing {
        if win.is_visible().unwrap_or(false) {
            if toggle {
                let _ = win.hide();
                run_in(win, "window.__kfCapture&&window.__kfCapture(false)");
            }
            return;
        }
    }
    {
        let mut s = st.0.lock().unwrap();
        if s.ready && existing.is_some() {
            drop(s);
            return show(app);
        }
        s.pending = true;
    }
    if existing.is_none() && tray_window(app, CAPTURE, "?capture", W, H).is_err() {
        st.0.lock().unwrap().pending = false;
        return fallback(app);
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(GRACE);
        if state(&app).is_some_and(|st| std::mem::take(&mut st.0.lock().unwrap().pending)) {
            fallback(&app);
        }
    });
}

/// The popup can't open: the bar in the main window, as before this existed.
fn fallback(app: &AppHandle) {
    show_main(app);
    call_main(app, "__kfTray", "\"capture\"");
}

/// The page has drawn, `height` logical px tall: show it if a press is waiting.
#[tauri::command]
pub(crate) fn capture_ready(app: AppHandle, height: f64) {
    let Some(st) = state(&app) else { return };
    let pending = {
        let mut s = st.0.lock().unwrap();
        s.ready = true;
        s.height = height.max(H);
        std::mem::take(&mut s.pending)
    };
    if pending {
        show(&app);
    }
}

/// The bar grew or shrank (chips, the jump row): the window follows, its top edge staying put.
#[tauri::command]
pub(crate) fn capture_size(app: AppHandle, height: f64) {
    let Some(st) = state(&app) else { return };
    let h = height.max(H);
    st.0.lock().unwrap().height = h;
    if let Some(win) = app.get_webview_window(CAPTURE).filter(|w| w.is_visible().unwrap_or(false)) {
        let _ = win.set_size(LogicalSize::new(W, h));
    }
}

/// Esc, or a line filed: the page closed its bar.
#[tauri::command]
pub(crate) fn capture_hide(window: WebviewWindow) {
    let _ = window.hide();
}

/// A click away: hide, and tell the page so the next opening starts fresh.
pub(crate) fn blurred(window: &tauri::Window) {
    let _ = window.hide();
    if let Some(w) = window.app_handle().get_webview_window(CAPTURE) {
        run_in(&w, "window.__kfCapture&&window.__kfCapture(false)");
    }
}

/// Settings → Quick capture shortcut: `accel` ("CommandOrControl+Shift+K"), or "" for none. True when
/// it is registered (or none was asked for); false when another app already owns it or it can't be read.
#[tauri::command]
pub(crate) fn capture_shortcut(app: AppHandle, accel: String) -> bool {
    set_shortcut(&app, accel.trim())
}

fn set_shortcut(app: &AppHandle, accel: &str) -> bool {
    let Some(st) = state(app) else { return false };
    let keys = app.global_shortcut();
    let old = st.0.lock().unwrap().accel.take();
    if let Some(old) = &old {
        let _ = keys.unregister(old.as_str());
    }
    if accel.is_empty() {
        return true;
    }
    let ok = keys.register(accel).is_ok();
    if ok {
        st.0.lock().unwrap().accel = Some(accel.to_string());
    } else if let Some(old) = old {
        // The new one is taken: keep the one that worked.
        if keys.register(old.as_str()).is_ok() {
            st.0.lock().unwrap().accel = Some(old);
        }
    }
    ok
}

/// `Some(true)` for a `kaisflow:` link to capture, `Some(false)` for any other, None when it isn't ours.
/// Windows hands the link over as `kaisflow://host/path/`, a Mac as the same; `kaisflow:host` is read too.
fn link_is_capture(url: &str) -> Option<bool> {
    let (scheme, rest) = url.trim().split_once(':')?;
    if !scheme.eq_ignore_ascii_case("kaisflow") {
        return None;
    }
    let host = rest.trim_start_matches('/').split(['/', '?', '#']).next().unwrap_or("");
    Some(host.eq_ignore_ascii_case("capture"))
}

/// A link arrived (see the top). Anything that isn't a `kaisflow:` link is ignored.
pub(crate) fn open_link(app: &AppHandle, url: &str) {
    match link_is_capture(url) {
        Some(true) => open(app, false),
        Some(false) => {
            if let Some(st) = state(app) {
                st.0.lock().unwrap().link = Some(url.trim().to_string());
            }
            show_main(app);
            call_main(app, "__kfDeepLink", "");
        }
        None => {}
    }
}

/// The links in a second launch's arguments: true when there was one (it was handled).
pub(crate) fn open_links_in(app: &AppHandle, args: &[String]) -> bool {
    let mut any = false;
    for a in args.iter().filter(|a| link_is_capture(a).is_some()) {
        open_link(app, a);
        any = true;
    }
    any
}

/// The web app asks for the link it was sent (once signed in: a cold start has none to run it before that).
#[tauri::command]
pub(crate) fn deep_link_take(app: AppHandle) -> Option<String> {
    state(&app)?.0.lock().unwrap().link.take()
}

/// Called once from the tray's setup: the state, the default shortcut, and the link that started us.
pub(crate) fn init(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle().clone();
    app.manage(Capture::new());
    let _ = set_shortcut(&handle, DEFAULT_ACCEL); // ponytail: Settings' choice (off included) arrives when the web app starts
    // A dev build isn't installed, so nothing has written the scheme to the registry; an installed one
    // already has it (the NSIS template, the MSIX manifest) and a run from elsewhere must not take it over.
    #[cfg(windows)]
    if tauri::is_dev() {
        let _ = app.deep_link().register_all();
    }
    let h = handle.clone();
    app.deep_link().on_open_url(move |e| {
        for url in e.urls() {
            open_link(&h, url.as_str());
        }
    });
    // Windows (and Linux): the link is in our own arguments. A Mac delivers it to on_open_url instead.
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        for url in urls {
            open_link(&handle, url.as_str());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{link_is_capture, top_left};

    const FHD: (f64, f64, f64, f64) = (0.0, 0.0, 1920.0, 1032.0);

    #[test]
    fn sits_centred_a_fifth_down() {
        assert_eq!(top_left(FHD, (520.0, 120.0)), (700, 206));
    }

    #[test]
    fn follows_a_second_monitor_left_of_the_main_one() {
        assert_eq!(top_left((-1920.0, 0.0, 0.0, 1040.0), (520.0, 120.0)), (-1220, 208));
    }

    #[test]
    fn stays_inside_a_small_work_area() {
        assert_eq!(top_left((0.0, 0.0, 400.0, 100.0), (520.0, 120.0)), (0, 0));
    }

    #[test]
    fn reads_the_links_the_widgets_send() {
        assert_eq!(link_is_capture("kaisflow://capture"), Some(true));
        assert_eq!(link_is_capture("kaisflow://capture/"), Some(true));
        assert_eq!(link_is_capture("KaisFlow://Capture?x=1"), Some(true));
        assert_eq!(link_is_capture("kaisflow:capture"), Some(true));
        assert_eq!(link_is_capture("kaisflow://today"), Some(false));
        assert_eq!(link_is_capture("kaisflow://task/9f1c"), Some(false));
        assert_eq!(link_is_capture("  kaisflow://focus/ "), Some(false));
    }

    #[test]
    fn ignores_what_is_not_ours() {
        assert_eq!(link_is_capture("--minimized"), None);
        assert_eq!(link_is_capture("https://capture"), None);
        assert_eq!(link_is_capture("C:\\Users\\x\\kais-flow.exe"), None);
    }
}
