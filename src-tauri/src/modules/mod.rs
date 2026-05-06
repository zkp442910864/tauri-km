//! Tauri 命令模块 —— 包含所有前端可调用的 `#[command]` 函数。
//!
//! 子模块：
//! - `amazon_mod` —— Amazon 产品数据采集（SKU 列表、产品详情 HTML、图片下载/比对）
//! - `shopify_mod` —— Shopify 后台自动化操作（登录、产品编辑/新增）
//! - `common_mod` —— 公共工具（浏览器管理、文件操作、截图）
//! - `log_mod` —— 日志系统
//! - `other_model` —— 通用数据模型（Response 包装、解析类型映射）

mod amazon_mod;
mod common_mod;
mod log_mod;
mod other_model;
pub mod shopify_mod;

use common_mod::{click_point, start_browser};
use headless_chrome::protocol::cdp::Page;
use log_mod::{push_web_log, WebLog};
use other_model::Response;
use tauri::async_runtime::spawn_blocking;
use tauri::command;
use tauri::http::HeaderMap;
use tauri::http::HeaderValue;
use tauri::AppHandle;
use tauri::Manager;
use tokio::task;

pub use amazon_mod::task_amazon_images_diff;
pub use amazon_mod::task_amazon_images_diff_v2;
pub use amazon_mod::task_amazon_product_fetch_html;
pub use amazon_mod::task_find_amazon_sku;

pub use common_mod::page_sustain_screenshot;
pub use common_mod::task_create_folder;
pub use common_mod::task_download_imgs;
pub use common_mod::MY_BROWSER;
pub use common_mod::MY_BROWSER_STATUS;

/// Tauri 命令：页面截图 —— 打开 URL 并截取 JPEG 截图，返回 base64 编码。
#[command]
pub async fn take_screenshot_v2(app: AppHandle, url: String) -> Result<String, String> {
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

/// Tauri 命令：测试图片验证码识别（未完成，已注释）。
///
/// 原计划使用 `ddddocr` 进行验证码 OCR 识别，当前为占位实现。
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

/// Tauri 命令：测试用 —— 返回应用本地数据目录路径。
#[command]
pub async fn custom_test(app: AppHandle) -> String {
    let val = app.path().app_local_data_dir();

    val.unwrap().to_string_lossy().to_string()
}

/// Tauri 命令：代理 Shopify Admin GraphQL API 请求。
///
/// 通过 Rust 端 `reqwest` 发送 GraphQL 请求，避免前端直接暴露 access_token。
///
/// # 参数
/// - `json`: GraphQL 查询/变更的 JSON 字符串
/// - `access_token`: Shopify Admin API 访问令牌
/// - `api_version`: API 版本号（如 `2024-10`）
/// - `store_domain`: Shopify 店铺域名
#[command]
pub async fn take_graphql_client(
    json: String,
    access_token: String,
    api_version: String,
    store_domain: String,
) -> Result<String, String> {
    let result = spawn_blocking(move || {
        let client = reqwest::blocking::Client::new();
        let mut headers = HeaderMap::new();
        headers.insert("Content-Type", HeaderValue::from_static("application/json"));
        headers.insert(
            "X-Shopify-Access-Token",
            HeaderValue::from_str(&access_token).unwrap(),
        );

        let res = client
            .post(format!(
                "{}/admin/api/{}/graphql.json",
                store_domain, api_version
            ))
            .headers(headers)
            .body(json)
            .send()
            .unwrap();

        res.json::<serde_json::Value>().unwrap()
    })
    .await;

    match result {
        Ok(data) => Response::new_result(1, Some(data), None),
        Err(e) => {
            let msg = format!("异步任务失败: {}", e);
            Response::<String>::new_result(0, None, Some(msg))
        }
    }
}
