// Kai's Flow native shell: the bundled web app in the system WebView. Everything the app does happens
// in the web code; on the desktop this also keeps the tray, its flyout and the toasts (tray.rs).
#[cfg(desktop)]
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = tray::install(builder);
    builder.run(tauri::generate_context!()).expect("error while running Kai's Flow");
}
