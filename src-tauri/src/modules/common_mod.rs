use super::{
    log_mod::{self, push_web_log, WebLog},
    other_model::Response,
};

use futures::future;
use headless_chrome::{Browser, LaunchOptions, Tab};
use image::{load_from_memory, EncodableLayout};
use reqwest::blocking;
use tauri_plugin_http::reqwest;
use template_matching::{find_extremes, Extremes, Image, MatchTemplateMethod, TemplateMatcher};
use std::{borrow::Cow, fs, path::Path, sync::Arc, thread::sleep, time::Duration};
use tauri::{command, path, App, AppHandle, Manager};
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
    let result = fs::create_dir_all(&file_path);

    file_path.to_string_lossy().to_string()
}

#[command]
/** 获取html */
pub async fn task_fetch_html(url: String) -> Result<String, String> {
    let scroll_to = |tab: &Arc<Tab>| {
        let anchor_point = [
            "feature-bullets",
            "productDetails_feature_div",
            "aplus_feature_div",
        ];
        for val in anchor_point {
            let data = tab.find_element(val);
            if let Ok(el) = data {
                let _ = el.scroll_into_view();
                sleep(Duration::from_millis(333));
            }
        }
    };

    let result = spawn_blocking(move || {
        let b_obj = start_browser(&url);
        if let Ok((tab, _)) = b_obj {
            scroll_to(&tab);
            sleep(Duration::from_secs(1));
            tab.get_content().unwrap()
        } else {
            "".to_string()
        }
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

#[command]
/** 创建文件夹 */
pub fn task_create_folder(app: AppHandle, url: String) -> Result<String, String> {
    let result = create_folder(app, url);
    Response::new_result(1, Some(result), None)
}

#[command]
/** 比对两组图片是存在差异 */
pub async fn task_images_diff(app: AppHandle, sku: String, folder_type: String, shopify_urls: Vec<String>, amazon_urls: Vec<String>) -> Result<String, String> {

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
                let file_name = format!("tu{}.png", index);
                let save_path = Path::new(&full_folder_path).join(file_name);
                println!("save_path: {:?}", save_path);
                let _ = fs::write(save_path, item).map_err(|e| {
                    format!("写入文件错误: {}", e)
                });
            });
        }

        status
    }).await;

    match result {
        Ok(val) => {
            Response::new_result(1, Some(val), None)
        }
        Err(e) => {
            Response::<bool>::new_result(0, Some(false), Some(format!("task_images_diff 失败: {}", e)))
        }
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