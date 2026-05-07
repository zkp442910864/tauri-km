use super::{
    log_mod::{self, push_web_log, WebLog},
    other_model::{BrowserStatus, Response},
};

use headless_chrome::{
    browser::tab::point::Point,
    protocol::cdp::{
        Page, DOM,
        Network::{CookieParam, CookiePriority, CookieSameSite},
    },
};
use headless_chrome::{Browser, LaunchOptions, Tab};
use image::{load_from_memory, EncodableLayout};
use lazy_static::lazy_static;
use reqwest::blocking;
use std::{
    borrow::Cow,
    fs,
    path::Path,
    sync::{Arc, Mutex},
    thread::sleep,
    time::Duration,
};
use tauri::{command, AppHandle, Manager};
use tauri_plugin_http::reqwest;
use template_matching::{find_extremes, Extremes, Image, MatchTemplateMethod, TemplateMatcher};
use tokio::task::spawn_blocking;

// 全局 headless_chrome 浏览器实例（懒加载单例）。
// 配置：非无头模式（headless: false）、启用 GPU、1 小时空闲超时。
lazy_static! {
    pub static ref MY_BROWSER: Browser = Browser::new(LaunchOptions {
        headless: false,
        devtools: false,
        sandbox: true,
        enable_gpu: true,
        enable_logging: false,
        idle_browser_timeout: Duration::from_secs(60 * 60),
        window_size: None,
        path: None,
        user_data_dir: None,
        port: None,
        ignore_certificate_errors: true,
        extensions: Vec::new(),
        process_envs: None,
        #[cfg(feature = "fetch")]
        fetcher_options: Default::default(),
        args: Vec::new(),
        ignore_default_args: Vec::new(),
        disable_default_args: false,
        proxy_server: None,
    })
    .unwrap();
}
// 浏览器实例状态标记（全局单例）。
// 用于跟踪 headless_chrome 是否正在使用中。
lazy_static! {
    pub static ref MY_BROWSER_STATUS: Mutex<BrowserStatus> = Mutex::new(BrowserStatus::new());
}

/// 启动浏览器并导航到指定 URL。
///
/// 流程：获取全局浏览器实例 → 创建新 Tab → 导航到目标 URL → 等待加载完成。
///
/// # 参数
/// - `url`: 目标页面 URL
///
/// # 返回
/// `(Arc<Tab>, &Browser)` 元组，Tab 用于后续 DOM 操作。
pub fn start_browser(url: &str) -> Result<(Arc<Tab>, &Browser), String> {
    push_web_log(WebLog::new_default("启动浏览器"));

    MY_BROWSER_STATUS.lock().unwrap().set_status(true);

    let browser = &MY_BROWSER;

    push_web_log(WebLog::new_default("打开tab标签"));
    let tab = browser.new_tab().map_err(|e| {
        push_web_log(WebLog::new_error("打开tab标签失败"));
        format!("Failed to create tab: {}", e)
    })?;

    push_web_log(WebLog::new_default("打开页面"));
    tab.navigate_to(url)
        .and_then(|_| tab.wait_until_navigated())
        .map_err(|e| {
            push_web_log(WebLog::new_error("打开页面失败"));
            format!("导航失败: {}", e)
        })?;

    Ok((tab, browser))
}

/// 为 Amazon 页面设置区域和语言 Cookie。
///
/// 设置以下 Cookie：
/// - `i18n-prefs=USD` —— 货币偏好为美元
/// - `lc-main=en_US` —— 语言偏好为美式英语
///
/// # 参数
/// - `tab`: 浏览器 Tab 实例
fn set_amazon_cookies(tab: &Arc<Tab>) -> Result<(), String> {
    tab.set_cookies(vec![
        CookieParam {
            domain: Some(".amazon.com".to_string()),
            url: None,
            name: "i18n-prefs".to_string(),
            value: "USD".to_string(),
            expires: None,
            http_only: Some(false),
            partition_key: None,
            path: Some("/".to_string()),
            priority: Some(CookiePriority::Medium),
            same_party: None,
            same_site: Some(CookieSameSite::Lax),
            secure: Some(false),
            source_port: None,
            source_scheme: None,
        },
        CookieParam {
            domain: Some(".amazon.com".to_string()),
            url: None,
            name: "lc-main".to_string(),
            value: "en_US".to_string(),
            expires: None,
            http_only: Some(false),
            partition_key: None,
            path: Some("/".to_string()),
            priority: Some(CookiePriority::Medium),
            same_party: None,
            same_site: Some(CookieSameSite::Lax),
            secure: Some(false),
            source_port: None,
            source_scheme: None,
        },
    ])
    .map_err(|e| format!("设置 Amazon Cookie 失败: {}", e))
}

/// 启动浏览器并导航到 Amazon 页面（自动注入区域/语言 Cookie）。
///
/// 流程：创建 Tab → 先导航到 amazon.com 建立域名上下文 →
/// 设置 `i18n-prefs=USD`、`lc-main=en_US` Cookie → 导航到目标 URL。
///
/// # 参数
/// - `url`: Amazon 页面 URL
///
/// # 返回
/// `(Arc<Tab>, &Browser)` 元组。
pub fn start_browser_amazon(url: &str) -> Result<(Arc<Tab>, &Browser), String> {
    push_web_log(WebLog::new_default("启动浏览器(Amazon)"));

    MY_BROWSER_STATUS.lock().unwrap().set_status(true);

    let browser = &MY_BROWSER;

    push_web_log(WebLog::new_default("打开tab标签"));
    let tab = browser.new_tab().map_err(|e| {
        push_web_log(WebLog::new_error("打开tab标签失败"));
        format!("Failed to create tab: {}", e)
    })?;

    // 先导航到 amazon.com 以建立域名上下文，使 Cookie 可以设置
    tab.navigate_to("https://www.amazon.com")
        .and_then(|_| tab.wait_until_navigated())
        .map_err(|e| format!("导航到 Amazon 首页失败: {}", e))?;

    // 设置区域和语言 Cookie
    push_web_log(WebLog::new_default("设置 Amazon Cookie (i18n-prefs=USD, lc-main=en_US)"));
    set_amazon_cookies(&tab)?;

    // 再导航到目标页面（Cookie 已生效）
    push_web_log(WebLog::new_default("打开目标页面"));
    tab.navigate_to(url)
        .and_then(|_| tab.wait_until_navigated())
        .map_err(|e| {
            push_web_log(WebLog::new_error("打开页面失败"));
            format!("导航失败: {}", e)
        })?;

    Ok((tab, browser))
}

/// 在桌面创建 `km-temp` 子文件夹，返回完整路径。
///
/// 所有临时文件（截图、下载图片等）都存放在 `~/Desktop/km-temp/` 下。
pub fn create_folder(app: AppHandle, url: String) -> String {
    let root_folder = "km-temp";
    let desktop_dir = app.path().desktop_dir().unwrap();
    let file_path = desktop_dir.join(root_folder).join(&url);
    let _ = fs::create_dir_all(&file_path);

    file_path.to_string_lossy().to_string()
}

/// Tauri 命令：创建文件夹（供前端调用）。
#[command]
pub fn task_create_folder(app: AppHandle, url: String) -> Result<String, String> {
    let result = create_folder(app, url);
    Response::new_result(1, Some(result), None)
}

/// Tauri 命令：批量下载图片到本地。
///
/// 在 `km-temp/<sku>/<folder_type>/` 目录下按序号保存 PNG 文件。
///
/// # 参数
/// - `sku`: 产品 SKU
/// - `folder_type`: 图片分类（如 `banner`、`detail`）
/// - `urls`: 图片 URL 列表
#[command]
pub async fn task_download_imgs(
    app: AppHandle,
    sku: String,
    folder_type: String,
    urls: Vec<String>,
) -> Result<String, String> {
    let full_folder_path = create_folder(
        app,
        Path::new(&sku)
            .join(&folder_type)
            .to_string_lossy()
            .to_string(),
    );

    let result = spawn_blocking(move || {
        // println!("DDD:::::00000");
        urls.iter().enumerate().for_each(|(index, url)| {
            // println!("DDD:::::11111");
            let (_, img_u8) = get_image_v2(url);
            // println!("DDD:::::22222");
            let file_name = format!("{}-{}-{:0>4}.png", sku, folder_type, index);
            let save_path = Path::new(&full_folder_path).join(file_name);
            let _ = fs::write(save_path, img_u8);
            // println!("DDD:::::33333");
        });
        // println!("DDD:::::44444");
    })
    .await;

    match result {
        Ok(_) => Response::<String>::new_result(1, None, None),
        Err(e) => {
            Response::<String>::new_result(0, None, Some(format!("task_download_file 失败: {}", e)))
        }
    }
}

/// 从 URL 下载图片并转换为模板匹配所需的 `Image` 格式。
///
/// 返回 `(Image, Vec<u8>)` 元组，Image 用于模板匹配，Vec<u8> 为原始字节。
pub fn get_image_v2(url: &str) -> (Image<'_>, Vec<u8>) {
    let response = blocking::get(url).unwrap();
    let val_vec = response.bytes().unwrap().to_vec();
    // let copy_val_vec = val_vec.clone();
    // let val_u8 = val_vec.as_bytes();

    let match_img = v8_to_img(val_vec.clone());

    (match_img, val_vec)
}

/// 将图片字节数据转换为灰度浮点 `Image`（用于模板匹配算法）。
pub fn v8_to_img(val: Vec<u8>) -> Image<'static> {
    let img = load_from_memory(&val).unwrap().to_luma32f();
    let width = img.width();
    let height = img.height();
    let img_f32_owned = Cow::Owned(img.into_raw());

    Image::new(img_f32_owned, width, height)
}

/// 保存页面快照（HTML + 截图）到 `km-temp/page-content/` 目录。
///
/// 用于调试和问题排查，保存页面的 HTML 源码和 JPEG 截图。
pub fn page_screenshot(app: AppHandle, tab: &Arc<Tab>, url: String, html: &String) {
    let path_url = create_folder(app, "page-content".to_string());
    let file_html_name = format!(
        "{}.html",
        url.replace("?language=en_US", "")
            .split("/")
            .last()
            .unwrap()
    );
    let file_img_name = format!(
        "{}.png",
        url.replace("?language=en_US", "")
            .split("/")
            .last()
            .unwrap()
    );
    let save_html_path = Path::new(&path_url).join(file_html_name);
    let save_img_path = Path::new(&path_url).join(file_img_name);

    let screenshot = tab
        .capture_screenshot(Page::CaptureScreenshotFormatOption::Jpeg, None, None, true)
        .map_err(|e| {
            push_web_log(WebLog::new_error("截图失败"));
            format!("截图失败: {}", e)
        })
        .unwrap();

    let _ = fs::write(save_html_path, html.as_bytes());
    let _ = fs::write(save_img_path, screenshot);
}

/// Tauri 命令：持续截图 —— 在指定时间内每秒截取页面快照。
///
/// 用于观察页面动态加载过程（如反爬验证页面）。
/// 截图保存到 `km-temp/page_sustain_screenshot/` 目录。
#[command]
pub async fn page_sustain_screenshot(app: AppHandle, url: String) -> Result<String, String> {
    let path_url = create_folder(app, "page_sustain_screenshot".to_string());

    let _ = spawn_blocking(move || {
        let (tab, browser) = start_browser(&url).unwrap();
        let mut current_second = 0.00;
        let total_seconds = 10.00;

        loop {
            if current_second > total_seconds {
                let _ = tab.close(true);
                return;
            } else {
                let html = tab.get_content().unwrap();
                let screenshot = tab
                    .capture_screenshot(Page::CaptureScreenshotFormatOption::Jpeg, None, None, true)
                    .map_err(|e| {
                        push_web_log(WebLog::new_error("截图失败"));
                        format!("截图失败: {}", e)
                    })
                    .unwrap();

                let file_name = format!("0000{}.png", current_second * 10.0);
                let file_html_name = format!("0000{}.html", current_second * 10.0);
                let save_img_path = Path::new(&path_url).join(file_name);
                let save_html_path = Path::new(&path_url).join(file_html_name);
                let _ = fs::write(&save_img_path, screenshot);
                let _ = fs::write(&save_html_path, html.as_bytes());

                // println!("Log::::{:?}", current_second);
                // let flag = html.find("Sorry, we just need to make sure you're not a robot. For best results, please make sure your browser is accepting cookies.");
                // if let Some(e) = flag {
                //     println!("Log::::{:?}", e);
                // }

                current_second = (current_second * 1000.00 + 1000.00) / 1000.00;
                // println!("Log::::{:?}", current_second);
                sleep(Duration::from_millis(1000));
            }
        }
    })
    .await;

    Response::<String>::new_result(1, None, None)
}

/// 通过 CSS 选择器定位元素并点击其中心坐标。
///
/// 使用 `getBoundingClientRect` 获取元素位置，偏移 +10px 确保点击在元素内部。
pub fn click_point(tab: &Arc<Tab>, selector: &str) {
    let point_web = tab
        .evaluate(
            &format!(
                "
        (() => {{
            const dom = document.querySelector('{}');
            const data = dom.getBoundingClientRect();
            return [data.x, data.y];
        }})()
    ",
                selector
            ),
            false,
        )
        .unwrap();

    let point_web_val_1 = &point_web.preview.unwrap();
    // println!("Log::::point_web::::{:?}", point_web_val_1.properties[0].clone().value.unwrap().parse::<f64>().unwrap());
    let point = Point {
        x: point_web_val_1.properties[0]
            .clone()
            .value
            .unwrap()
            .parse::<f64>()
            .unwrap()
            + 10.0,
        y: point_web_val_1.properties[1]
            .clone()
            .value
            .unwrap()
            .parse::<f64>()
            .unwrap()
            + 10.0,
    };

    let _ = tab.move_mouse_to_point(point);
    let _ = tab.click_point(point);
}
