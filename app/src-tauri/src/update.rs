// Silent updates, the native half (the web half is src/lib/autoUpdate.ts). The app downloads a new
// version in the background and holds it; it is installed only when the person leaves: Quit in the
// tray or the menu, Cmd+Q, or closing the last window with no tray icon. Windows' installer closes
// the app, so the install must run before the exit, and only the page can flush the outbox first —
// so a quit with an update waiting is held here, the page installs, and it comes back through
// `app_exit`. A second Quit while that runs goes straight through, and so does a quit the page
// never answers (GRACE).
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, ExitRequestApi, Manager};

use crate::tray::{call_main, FLYOUT, MENU};

/// How long the page gets to flush the outbox and install before the quit goes through anyway.
const GRACE: Duration = Duration::from_secs(30);

#[derive(Default)]
pub struct Gate {
    /// The page holds a downloaded update (`update_ready`).
    ready: AtomicBool,
    /// A held quit is in progress (or the page said go): the next exit request is let through.
    leaving: AtomicBool,
}

/// Hold this quit for the page's install? Only an ordinary quit, with an update waiting, that the
/// page can still answer, and not twice. (A restart, `app.restart()`, never gets here.)
fn holds(ready: bool, leaving: bool, has_page: bool, code: Option<i32>) -> bool {
    ready && !leaving && has_page && code != Some(tauri::RESTART_EXIT_CODE)
}

fn has_page(app: &AppHandle) -> bool {
    app.get_webview_window("main").is_some()
}

/// Start the held quit: ask the page (`window.__kfQuit`), and quit anyway if it never answers.
fn hold(app: &AppHandle) {
    app.state::<Gate>().leaving.store(true, Ordering::SeqCst);
    call_main(app, "__kfQuit", "");
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(GRACE);
        app.exit(0);
    });
}

/// From `RunEvent::ExitRequested` (lib.rs): hold the quit when an update is waiting.
pub fn on_exit_requested(app: &AppHandle, api: &ExitRequestApi, code: Option<i32>) {
    let Some(g) = app.try_state::<Gate>() else { return };
    if holds(g.ready.load(Ordering::SeqCst), g.leaving.load(Ordering::SeqCst), has_page(app), code) {
        api.prevent_exit();
        hold(app);
    }
}

/// From the main window's close request when there is no tray icon (closing it would quit): true =
/// held, the window stays until the page has installed.
pub fn on_close_would_quit(app: &AppHandle) -> bool {
    let Some(g) = app.try_state::<Gate>() else { return false };
    let held = holds(g.ready.load(Ordering::SeqCst), g.leaving.load(Ordering::SeqCst), has_page(app), None);
    if held {
        hold(app);
    }
    held
}

/// The page has downloaded an update (true), or no longer holds one (false).
#[tauri::command]
pub fn update_ready(app: AppHandle, ready: bool) {
    app.state::<Gate>().ready.store(ready, Ordering::SeqCst);
}

/// The page is done (installed on the Mac, or it could not): quit now, whatever is waiting.
#[tauri::command]
pub fn app_exit(app: AppHandle) {
    app.state::<Gate>().leaving.store(true, Ordering::SeqCst);
    app.exit(0)
}

// An app that lives in the tray is almost never quit, so an update also installs once the app has sat
// idle in the tray for a while (the page decides, src/lib/autoUpdate.ts, and asks `shell_idle` here).
// That install relaunches the app, and a relaunch should not pop a window up in front of nobody: the
// page leaves a marker (`relaunch_hidden`) and the next start reads it (`take_relaunch_hidden`).

/// Nobody is using the app: the main window is hidden or minimised, and no tray window is up.
fn idle(main_visible: bool, main_minimized: bool, others_visible: bool) -> bool {
    (!main_visible || main_minimized) && !others_visible
}

#[tauri::command]
pub fn shell_idle(app: AppHandle) -> bool {
    let shown = |label: &str| app.get_webview_window(label).is_some_and(|w| w.is_visible().unwrap_or(false));
    let minimized = app.get_webview_window("main").is_some_and(|w| w.is_minimized().unwrap_or(false));
    idle(shown("main"), minimized, [FLYOUT, MENU, crate::capture::CAPTURE].into_iter().any(shown))
}

/// How long a "come back hidden" marker is believed; a relaunch takes seconds.
const MARKER_LIFE: u64 = 10 * 60;

fn marker(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("relaunch-hidden"))
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn fresh(written: u64, now: u64) -> bool {
    now >= written && now - written <= MARKER_LIFE
}

/// The page is about to install and relaunch for an idle app (true), or it did not go through (false).
#[tauri::command]
pub fn relaunch_hidden(app: AppHandle, on: bool) {
    let Some(path) = marker(&app) else { return };
    if on {
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
        let _ = std::fs::write(&path, now_secs().to_string());
    } else {
        let _ = std::fs::remove_file(&path);
    }
}

/// At start: was this launch an update relaunch of an idle app? Consumes the marker.
pub fn take_relaunch_hidden(app: &AppHandle) -> bool {
    let Some(path) = marker(app) else { return false };
    let written = std::fs::read_to_string(&path).ok().and_then(|s| s.trim().parse::<u64>().ok());
    let _ = std::fs::remove_file(&path);
    written.is_some_and(|w| fresh(w, now_secs()))
}

#[cfg(test)]
mod tests {
    use super::{fresh, holds, idle};

    #[test]
    fn idle_means_the_window_is_away_and_nothing_else_is_up() {
        assert!(idle(false, false, false)); // closed to the tray
        assert!(idle(true, true, false)); // minimised
        assert!(!idle(true, false, false)); // in use
        assert!(!idle(false, false, true)); // the flyout or the capture popup is open
        assert!(!idle(true, true, true));
    }

    #[test]
    fn the_hidden_relaunch_marker_expires() {
        assert!(fresh(1000, 1030));
        assert!(!fresh(1000, 1000 + 11 * 60));
        assert!(!fresh(1000, 900)); // a clock set back
    }

    #[test]
    fn holds_an_ordinary_quit_while_an_update_waits() {
        assert!(holds(true, false, true, Some(0)));
        assert!(holds(true, false, true, None));
    }

    #[test]
    fn lets_everything_else_through() {
        assert!(!holds(false, false, true, Some(0))); // nothing downloaded
        assert!(!holds(true, true, true, Some(0))); // already held once: a second Quit, or the page's own exit
        assert!(!holds(true, false, false, None)); // no page to install from
        assert!(!holds(true, false, true, Some(tauri::RESTART_EXIT_CODE))); // a restart
    }
}
