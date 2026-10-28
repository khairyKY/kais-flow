// Kai's Flow native shell: the bundled web app in the system WebView. Everything the app does happens
// in the web code; on the desktop this also keeps the tray, its flyout and the toasts (tray.rs).
#[cfg(desktop)]
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());
    #[cfg(desktop)]
    let builder = tray::install(builder).plugin(tauri_plugin_updater::Builder::new().build());
    let app = builder.build(tauri::generate_context!()).expect("error while running Kai's Flow");
    app.run(|_app, _event| {
        // The Mac app: a click on the Dock icon brings back a window that was closed to the menu bar.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            tray::show_main(_app);
        }
    });
}
