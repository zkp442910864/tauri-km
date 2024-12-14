mod amazon_mod;
mod common_mod;
mod log_mod;
mod other_model;

use common_mod::start_browser;
use headless_chrome::protocol::cdp::Database::Error;
use headless_chrome::protocol::cdp::Page;
use headless_chrome::{Browser, LaunchOptions, Tab};
use log_mod::{push_web_log, WebLog};
use other_model::Response;
use tauri::command;
use tokio::task;

pub use amazon_mod::task_find_amazon_sku;
pub use common_mod::task_create_folder;
pub use common_mod::task_fetch_html;
pub use common_mod::task_images_diff;
pub use common_mod::task_download_imgs;

#[command]
pub async fn take_screenshot_v2(url: String) -> Result<String, String> {
    let result = task::spawn_blocking(move || -> Result<String, String> {
        push_web_log(WebLog::new_title("截图"));

        let tab = start_browser(&url).unwrap();
        let screenshot = tab
            .0
            .capture_screenshot(Page::CaptureScreenshotFormatOption::Jpeg, None, None, true)
            .map_err(|e| {
                push_web_log(WebLog::new_error("截图失败"));
                format!("截图失败: {}", e)
            })?;

        Ok(base64::encode(screenshot))
    })
    .await;

    match result {
        Ok(data) => {
            if let Ok(val) = data {
                Response::new_result(1, Some(val), None)
            } else {
                Response::<String>::new_result(0, None, None)
            }
        }
        Err(e) => {
            let msg = format!("异步任务失败: {}", e);
            Response::<String>::new_result(0, None, Some(msg))
        }
    }
}

#[command]
pub fn my_custom_command() {
    println!("我是从JavaScript调用的!");
}
