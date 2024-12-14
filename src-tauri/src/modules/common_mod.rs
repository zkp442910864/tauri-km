use super::{
    log_mod::{self, push_web_log, WebLog},
    other_model::Response,
};

use futures::future;
use headless_chrome::protocol::cdp::Page;
use headless_chrome::{Browser, LaunchOptions, Tab};
use image::{load_from_memory, EncodableLayout};
use reqwest::blocking;
use std::{borrow::Cow, fs, path::Path, sync::Arc, thread::sleep, time::Duration};
use tauri::{command, path, App, AppHandle, Manager};
use tauri_plugin_http::reqwest;
use template_matching::{find_extremes, Extremes, Image, MatchTemplateMethod, TemplateMatcher};
use tokio::task::spawn_blocking;

pub fn start_browser(url: &str) -> Result<(Arc<Tab>, Browser), String> {
    push_web_log(WebLog::new_default("启动浏览器"));
    let browser = Browser::new(LaunchOptions::default()).map_err(|e| {
        push_web_log(WebLog::new_error("无法启动浏览器"));
        format!("无法启动浏览器: {}", e)
    })?;

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
    // Ok(false)
    let root_folder = "km-temp";
    let desktop_dir = app.path().desktop_dir().unwrap();
    let file_path = desktop_dir.join(root_folder).join(&url);
    let _ = fs::create_dir_all(&file_path);

    file_path.to_string_lossy().to_string()
}

/** 获取html */
#[command]
pub async fn task_fetch_html(app: AppHandle, url: String) -> Result<String, String> {
    let scroll_to = |tab: &Arc<Tab>| {
        let mut flag = true;
        let mut total_count = 5;
        let mut reset = false;
        while flag {
            let data = tab.find_element("body");
            let flag_content =
                tab.find_element("#productDetails_feature_div a i~span.a-expander-prompt");
            if let Ok(_) = flag_content {
                flag = false;
                // println!("start::::flag");
            }
            else if  total_count <= 0 {
                flag = false;
                reset = true;
                // println!("task_fetch_html::::timeout count");
            }
            else if let Ok(el) = data {
                let _ = el.scroll_into_view();
                sleep(Duration::from_secs(2));
                total_count = total_count - 1;
                // println!("start::::scroll");
            } else {
                sleep(Duration::from_secs(3));
                total_count = total_count - 1;
                // println!("start::::fail");
            }
        }
        // println!("start::::333333");

        reset
    };

    let is_check_page = |tab: &Arc<Tab>| {
        let html = tab.get_content().unwrap();
        let flag = html.find("Sorry, we just need to make sure you're not a robot. For best results, please make sure your browser is accepting cookies.");
        println!("Log::::{:?}", html);
        println!("Log::::{:?}", flag);

        match flag {
            Some(_) => (true, html),
            None => (false, html),
        }
    };

    let result = spawn_blocking(move || {
        let (tab, browser) = start_browser(&url).unwrap();

        let (check_page, check_html) = is_check_page(&tab);
        if check_page {
            page_screenshot(app, &tab, url, &check_html);
            return "".to_string();
        }

        let reset = scroll_to(&tab);
        if reset {
            println!("log::::refresh");
            let _ = tab.reload(false, None);
            scroll_to(&tab);
        }
        let html = tab.get_content().unwrap();

        page_screenshot(app, &tab, url, &html);

        html
    })
    .await;

    match result {
        Ok(data) => {
            if data != "" {
                Response::new_result(1, Some(data), None)
            }
            else {
                Response::<String>::new_result(0, None, Some(format!("需要验证页面")))
            }
        },
        Err(e) => {
            let msg = format!("异步任务失败: {}", e);
            Response::<String>::new_result(0, None, Some(msg))
        }
    }
}

/** 创建文件夹 */
#[command]
pub fn task_create_folder(app: AppHandle, url: String) -> Result<String, String> {
    let result = create_folder(app, url);
    Response::new_result(1, Some(result), None)
}

/** 比对两组图片是存在差异 */
#[command]
pub async fn task_images_diff(
    app: AppHandle,
    sku: String,
    folder_type: String,
    shopify_urls: Vec<String>,
    amazon_urls: Vec<String>,
) -> Result<String, String> {
    let result = tokio::task::spawn_blocking(move || -> bool {
        let mut result_arr = Vec::<Extremes>::new();
        let mut result_img_arr = Vec::<Vec<u8>>::new();
        let mut status = false;

        for (index, url_str1) in shopify_urls.iter().enumerate() {
            let url_str2_result = amazon_urls.get(index);
            if url_str2_result == None {
                continue;
            }
            let url_str2: &String = url_str2_result.unwrap();

            let (img1, _) = get_image_v2(url_str1);
            let (img2, raw_bytes) = get_image_v2(url_str2);

            let mut matcher = TemplateMatcher::new();
            matcher.match_template(img1, img2, MatchTemplateMethod::SumOfSquaredDifferences);

            let result = matcher.wait_for_result().unwrap();
            result_arr.push(find_extremes(&result));
            result_img_arr.push(raw_bytes);
        }

        result_arr.iter().for_each(|item| {
            if item.min_value > 100.0 || item.max_value > 100.0 {
                status = true;
            }
        });

        if status {
            let folder_path = Path::new(&sku).join(&folder_type);
            let full_folder_path = create_folder(app, folder_path.to_string_lossy().to_string());

            println!("full_folder_path: {:?}", full_folder_path);
            result_img_arr.iter().enumerate().for_each(|(index, item)| {
                let file_name = format!("{}-{}.png", sku, index);
                let save_path = Path::new(&full_folder_path).join(file_name);
                println!("save_path: {:?}", save_path);
                let _ = fs::write(save_path, item).map_err(|e| format!("写入文件错误: {}", e));
            });
        }

        status
    })
    .await;

    match result {
        Ok(val) => Response::new_result(1, Some(val), None),
        Err(e) => Response::<bool>::new_result(
            0,
            Some(false),
            Some(format!("task_images_diff 失败: {}", e)),
        ),
    }
}

/** 下载图片 */
#[command]
pub async fn task_download_imgs(app: AppHandle, sku: String, folder_type: String, urls: Vec<String>) -> Result<String, String> {
    let full_folder_path = create_folder(app, Path::new(&sku).join(&folder_type).to_string_lossy().to_string());

    let result = spawn_blocking(move || {
        // println!("DDD:::::00000");
        urls.iter().enumerate().for_each(|(index, url)| {
            // println!("DDD:::::11111");
            let (_, img_u8) = get_image_v2(url);
            // println!("DDD:::::22222");
            let file_name = format!("{}-{}.png", sku, index);
            let save_path = Path::new(&full_folder_path).join(file_name);
            let _ = fs::write(save_path, img_u8);
            // println!("DDD:::::33333");
        });
        // println!("DDD:::::44444");

    }).await;

    match result {
        Ok(_) => Response::<String>::new_result(1, None, None),
        Err(e) => Response::<String>::new_result(0, None, Some(format!("task_download_file 失败: {}", e))),
    }
}

fn get_image_v2(url: &str) -> (Image<'_>, Vec<u8>) {
    let response = blocking::get(url).unwrap();
    let val_vec = response.bytes().unwrap().to_vec();
    let copy_val_vec = val_vec.clone();
    let val_u8 = val_vec.as_bytes();
    let img = load_from_memory(val_u8).unwrap().to_luma32f();
    // let img_vec_f32 = img.to_vec();
    let width = img.width();
    let height = img.height();
    let img_f32_owned = Cow::Owned(img.into_raw());

    let match_img = Image::new(img_f32_owned, width, height);

    (match_img, copy_val_vec)
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
