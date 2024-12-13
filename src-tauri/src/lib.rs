mod modules;
use modules::{my_custom_command, take_screenshot_v2, task_create_folder, task_fetch_html, task_find_amazon_sku, task_images_diff};

#[cfg_attr(mobile, tauri::mobile_entry_point)]

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // println!("WebView get_webview_window: {:?}", 3);
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            my_custom_command,
            take_screenshot_v2,
            task_find_amazon_sku,
            task_fetch_html,
            task_create_folder,
            task_images_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
