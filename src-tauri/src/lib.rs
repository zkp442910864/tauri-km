mod modules;
use std::process::Command;

use modules::{
    custom_test, page_sustain_screenshot, shopify_mod, take_graphql_client, take_screenshot_v2,
    task_amazon_images_diff, task_amazon_images_diff_v2, task_amazon_product_fetch_html,
    task_create_folder, task_download_imgs, task_fetch_image, task_find_amazon_sku, MY_BROWSER,
    MY_BROWSER_STATUS,
};
use std::time::Duration;
use tauri::{async_runtime::spawn, Manager};
use tokio::{runtime::Runtime, task::spawn_blocking};

/// Tauri 应用入口 —— 注册所有插件和命令。
///
/// 插件列表：
/// - `window_state` —— 窗口状态持久化
/// - `dialog` —— 文件选择对话框
/// - `sql` —— SQLite 数据库
/// - `store` —— KV 持久化存储
/// - `clipboard_manager` —— 剪贴板操作
/// - `fs` —— 文件系统操作
/// - `shell` —— 外部链接打开
/// - `http` —— HTTP 请求
///
/// 注册的 Tauri 命令见 `invoke_handler` 宏调用。
#[cfg_attr(mobile, tauri::mobile_entry_point)]

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // println!("WebView get_webview_window: {:?}", 3);

            let web_win = app.get_webview_window("main").unwrap();

            // web_win.open_devtools();
            web_win.on_window_event(move |e| {
                let str = format!("{:?}", e);
                // println!("Log::::on_window_event::::{}", str);
                #[cfg(target_os = "windows")]
                if str == "Destroyed" {
                    if MY_BROWSER_STATUS.lock().unwrap().get_status() {
                        let browser = &MY_BROWSER;
                        let pid = browser.get_process_id().unwrap();
                        let _ = Command::new("taskkill")
                            .arg("/F")
                            .arg("/PID")
                            .arg(pid.to_string())
                            .output()
                            .expect("Unable to terminate the browser process");
                    }
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
            task_fetch_image,
            page_sustain_screenshot,
            shopify_mod::task_shopify_store_login,
            shopify_mod::task_shopify_store_login_status,
            shopify_mod::task_shopify_store_product_open,
            shopify_mod::task_shopify_store_product_update_item,
            shopify_mod::task_shopify_store_product_finish,
            custom_test,
            take_graphql_client,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 浏览器保活 —— 定期创建并关闭 Tab，防止浏览器实例因空闲超时被回收。
///
/// 每 6 秒（3 秒创建 + 3 秒等待）执行一次空操作。
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
