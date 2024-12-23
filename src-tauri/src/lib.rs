mod modules;
use std::process::Command;

use modules::{
    page_sustain_screenshot, shopify_mod, take_screenshot_v2, task_amazon_images_diff,
    task_amazon_images_diff_v2, task_amazon_product_fetch_html, task_create_folder,
    task_download_imgs, task_find_amazon_sku, MY_BROWSER, custom_test,
};
use std::time::Duration;
use tauri::{async_runtime::spawn, Manager};
use tokio::{runtime::Runtime, task::spawn_blocking};

#[cfg_attr(mobile, tauri::mobile_entry_point)]

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // println!("WebView get_webview_window: {:?}", 3);
            let browser = &MY_BROWSER;
            let pid = browser.get_process_id().unwrap();
            let web_win = app.get_webview_window("main").unwrap();

            // browser_keep_alive();
            // web_win.open_devtools();
            web_win.on_window_event(move |e| {
                let str = format!("{:?}", e);
                // println!("Log::::on_window_event::::{}", str);
                #[cfg(target_os = "windows")]
                if str == "Destroyed" {
                    let _ = Command::new("taskkill")
                        .arg("/F")
                        .arg("/PID")
                        .arg(pid.to_string())
                        .output()
                        .expect("Unable to terminate the browser process");
                }
            });

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
            take_screenshot_v2,
            task_find_amazon_sku,
            task_amazon_product_fetch_html,
            task_create_folder,
            task_amazon_images_diff,
            task_amazon_images_diff_v2,
            task_download_imgs,
            page_sustain_screenshot,
            shopify_mod::task_shopify_store_login,
            shopify_mod::task_shopify_store_login_status,
            shopify_mod::task_shopify_store_product_open,
            shopify_mod::task_shopify_store_product_update_item,
            shopify_mod::task_shopify_store_product_finish,
            custom_test,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/** 浏览器保持活动状态 */
pub fn browser_keep_alive() {
    println!("Log::::start::::browser_keep_alive");

    spawn(async move {
        loop {
            println!("Log::::browser_keep_alive");
            let browser = &MY_BROWSER;
            let tab = browser.new_tab().unwrap();
            // let _ = tab.navigate_to("chrome://version/");
            tokio::time::sleep(Duration::from_secs(3)).await;
            let _ = tab.close(true);
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    });
}
