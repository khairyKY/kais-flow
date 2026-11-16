// Silent updates, the native half (the web half is src/lib/autoUpdate.ts). The app downloads a new
// version in the background and holds it; it is installed only when the person leaves: Quit in the
// tray or the menu, Cmd+Q, or closing the last window with no tray icon. Windows' installer closes
// the app, so the install must run before the exit, and only the page can flush the outbox first —
// so a quit with an update waiting is held here, the page installs, and it comes back through
// `app_exit`. A second Quit while that runs goes straight through, and so does a quit the page
// never answers (GRACE).
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, ExitRequestApi, Manager};

use crate::tray::call_main;

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

#[cfg(test)]
mod tests {
    use super::holds;

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
