use super::{
    log_mod::{self, push_web_log, WebLog},
    other_model::{BrowserStatus, Response},
};

use headless_chrome::{
    browser::tab::point::Point,
    protocol::cdp::{Page, DOM},
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
    pub static ref MY_BROWSER_STATUS: Mutex<BrowserStatus> = Mutex::new(BrowserStatus::new());
}

/** 启动浏览器 */
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

/** 创建文件夹 */
pub fn create_folder(app: AppHandle, url: String) -> String {
    let root_folder = "km-temp";
    let desktop_dir = app.path().desktop_dir().unwrap();
    let file_path = desktop_dir.join(root_folder).join(&url);
    let _ = fs::create_dir_all(&file_path);

    file_path.to_string_lossy().to_string()
}

/** 提供web使用: 创建文件夹 */
#[command]
pub fn task_create_folder(app: AppHandle, url: String) -> Result<String, String> {
    let result = create_folder(app, url);
    Response::new_result(1, Some(result), None)
}

/** 下载图片 */
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

pub fn get_image_v2(url: &str) -> (Image<'_>, Vec<u8>) {
    let response = blocking::get(url).unwrap();
    let val_vec = response.bytes().unwrap().to_vec();
    // let copy_val_vec = val_vec.clone();
    // let val_u8 = val_vec.as_bytes();

    let match_img = v8_to_img(val_vec.clone());

    (match_img, val_vec)
}

pub fn v8_to_img(val: Vec<u8>) -> Image<'static> {
    let img = load_from_memory(&val).unwrap().to_luma32f();
    let width = img.width();
    let height = img.height();
    let img_f32_owned = Cow::Owned(img.into_raw());

    Image::new(img_f32_owned, width, height)
}

/** 页面快照 */
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

/** 页面快照,x秒内 */
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

/** 点击页面某个点 */
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
