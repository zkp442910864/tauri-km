mod amazon_mod;
mod common_mod;
mod log_mod;
mod other_model;

use common_mod::{click_point, start_browser};
use headless_chrome::protocol::cdp::Page;
use log_mod::{push_web_log, WebLog};
use other_model::Response;
use tauri::command;
use tokio::task;

pub use amazon_mod::task_find_amazon_sku;
pub use common_mod::task_create_folder;
pub use amazon_mod::task_amazon_product_fetch_html;
pub use common_mod::task_images_diff;
pub use common_mod::task_download_imgs;
pub use common_mod::page_sustain_screenshot;
pub use common_mod::MY_BROWSER;

/** 页面截图 */
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

        let _ = tab.0.close(true);
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

/** 测试图片验证码识别,并输入 */
#[command]
pub async fn take_test_check(url: String) {
    // ddddocr = {git = "https://github.com/86maid/ddddocr.git", branch = "master"}

    // let result = task::spawn_blocking(move || {
    //     let (tab, _) = start_browser(&url).unwrap();
    //     // document.querySelector('img').src
    //     let img = tab.find_element("form img").unwrap();
    //     let img_url = img.get_attribute_value("src").unwrap().unwrap();
    //     let code = "TEKXEU".split("");
    //     // TODO: 解析图片内容
    //     let image = std::fs::read("C:\\Users\\zhouk\\Desktop\\Amazon.com_files\\Captcha_hgsehclwub.jpg").unwrap();
    //     let mut ocr = ddddocr::ddddocr_classification().unwrap();
    //     let res = ocr.classification(image, true).unwrap();
    //     println!("log::::{:?}", res);

    //     click_point(&tab, "form input#captchacharacters");
    //     code.for_each(|val| {
    //         tab.press_key(val);
    //     });
    //     click_point(&tab, "form button");
    // })
    // .await;
}
