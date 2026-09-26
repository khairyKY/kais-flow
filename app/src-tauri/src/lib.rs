// Kai's Flow native shell: one window around the bundled web app. Everything the app does happens
// in the web code; this only boots the WebView (Android entry point + desktop main).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Kai's Flow");
}
