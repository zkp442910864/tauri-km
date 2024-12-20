use futures::future::join_all;
use futures::{stream, StreamExt, TryFutureExt};
use reqwest::{Client, Error};
use tauri::{command, AppHandle};

use headless_chrome::{Browser, LaunchOptions, Tab};
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;
use std::{borrow::Cow, fs, path::Path, thread::sleep};
use template_matching::{find_extremes, Extremes, MatchTemplateMethod, TemplateMatcher};
use tokio::{
    spawn,
    task::{self, spawn_blocking},
};

use crate::modules::common_mod::create_folder;

use super::common_mod::v8_to_img;
use super::{
    common_mod::{click_point, get_image_v2, page_screenshot, start_browser},
    log_mod::{push_web_log, WebLog},
    other_model::Response,
};

/**
 * 获取亚马逊产品列表
 *  [...document.querySelectorAll('button')].find(ii => ii.innerText === 'Show more').click()
 *  document.querySelector('.Loading__loading__wrapper__ysimX>img')
 */
#[command]
pub async fn task_find_amazon_sku(url: String) -> Result<String, String> {
    // 加载更多,有就触发
    let trigger_more_btn = |tab: &Arc<Tab>| -> bool {
        let btn = tab.find_element("[class^=ShowMoreButton] button");
        if let Ok(el) = btn {
            let _ = el.click();
            true
        } else {
            false
        }

        // let buttons = tab.find_elements("button");

        // match buttons {
        //     Ok(btns) => {
        //         let btn = btns.into_iter().find(|item| {
        //             // let Ok(val) = item.get_inner_text().map_err(|e| format!("val {}", e));
        //             if let Ok(val) = item.get_inner_text() {
        //                 // println!("button text: {}", val);
        //                 val == "Show more"
        //             } else {
        //                 false
        //             }
        //         });
        //         if let Some(btn_instance) = btn {
        //             let _ = btn_instance.click();
        //             true
        //         } else {
        //             false
        //         }
        //     }
        //     Err(_) => false,
        // }
    };

    // 判断 loading 存在
    let has_loading =
        |tab: &Arc<Tab>| match tab.find_element(".Loading__loading__wrapper__ysimX>img") {
            Ok(_) => true,
            Err(_) => false,
        };

    // 循环触发数据加载
    let each_more_data = move |tab: &Arc<Tab>| {
        push_web_log(WebLog::new_default("循环加载更多数据"));

        // std::thread::sleep(Duration::from_secs(1));
        loop {
            if trigger_more_btn(tab) || has_loading(tab) {
                std::thread::sleep(Duration::from_secs(2));
            } else {
                return;
            }
        }
    };

    // 提取数据
    let extract_sku = |tab: &Arc<Tab>| {
        push_web_log(WebLog::new_default("提取页面sku数据"));

        let li_val = tab.find_elements("[data-csa-c-item-id]");
        match li_val {
            Ok(lis) => {
                let str = "";
                let arr = lis
                    .into_iter()
                    .map(|item| {
                        let val = item.get_attribute_value("data-csa-c-item-id");
                        if let Ok(Some(inline_val)) = val {
                            inline_val
                        } else {
                            str.to_string()
                        }
                    })
                    .filter(|val| val != "")
                    .collect();
                Ok(arr)
            }
            Err(e) => Err(e),
        }
    };

    let result = task::spawn_blocking(move || {
        push_web_log(WebLog::new_title("获取亚马逊产品列表:").with_msg_arr(vec![&url]));
        let tab = start_browser(&url).unwrap();

        each_more_data(&tab.0);
        let arr = extract_sku(&tab.0);

        push_web_log(WebLog::new_default("完成").with_msg_arr(vec![&url]));

        let _ = tab.0.close(true);
        if let Ok(val) = arr {
            val
        } else {
            Vec::new()
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

/** 获取亚马逊产品详情html */
#[command]
pub async fn task_amazon_product_fetch_html(app: AppHandle, url: String) -> Result<String, String> {
    let find_assign_dom = |tab: &Arc<Tab>| {
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
            } else if total_count <= 0 {
                flag = false;
                reset = true;
                // println!("task_fetch_html::::timeout count");
            } else if let Ok(el) = data {
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
        // println!("Log::::{:?}", html);
        // println!("Log::::{:?}", flag);

        match flag {
            Some(_) => true,
            None => false,
        }
    };

    let is_unfinished = |tab: &Arc<Tab>| {
        // let dom = tab.get_document().unwrap();
        // dom
        let mut count = 0;
        let max_count = 10;
        loop {
            let status = tab.evaluate("document.readyState", false).unwrap();
            let val = status.value.unwrap();
            if val == "complete" {
                return false;
            } else if count > max_count {
                return true;
            } else {
                count = count + 1;
                sleep(Duration::from_secs(1));
                println!("Log::::readyState::::{:?}", val);
            }
        }
        // if status.value.unwrap() == "complete" {}
    };

    let handle_check_page = |tab: &Arc<Tab>| {
        // document.querySelector('img').src
        let img = tab.find_element("form img").unwrap();
        let img_url = img.get_attribute_value("src").unwrap().unwrap();
        let code = "TEKXEU".split("");
        // 解析图片内容
        click_point(tab, "form input#captchacharacters");
        code.for_each(|val| {
            tab.press_key(val);
        });
        click_point(tab, "form button");
    };

    let result = spawn_blocking(move || {
        let (tab, browser) = start_browser(&url).unwrap();

        let mut flag = true;
        let max_count = 3;
        let mut count = 0;
        while flag && count < max_count {
            // tab.load
            count = count + 1;

            flag = is_unfinished(&tab);
            if flag {
                println!("Log::::Load the unfinished page");
                let _ = tab.navigate_to(&url);
                continue;
            }
            flag = is_check_page(&tab);
            if flag {
                println!("Log::::check page");
                sleep(Duration::from_secs(30));
                break;
                // handle_check_page(&tab);
                // sleep(Duration::from_secs(10));
                // let _ = tab.navigate_to(&url);
                // continue;
            }
            // 好像亚马逊那边不显示这块了
            // flag = find_assign_dom(&tab);
            // if flag {
            //     println!("Log::::no find dom");
            //     // tab.delete_cookies(cs);
            //     let _ = tab.navigate_to(&url);
            //     continue;
            // }
        }

        let html = tab.get_content().unwrap();

        page_screenshot(app, &tab, url, &html);
        let _ = tab.close(true);

        html
    })
    .await;

    match result {
        Ok(data) => {
            if data != "" {
                Response::new_result(1, Some(data), None)
            } else {
                Response::<String>::new_result(0, None, Some(format!("需要验证页面")))
            }
        }
        Err(e) => {
            let msg = format!("异步任务失败: {}", e);
            Response::<String>::new_result(0, None, Some(msg))
        }
    }
}

/** 比对两组图片是存在差异 */
#[command]
pub async fn task_amazon_images_diff(
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

#[command]
pub async fn task_amazon_images_diff_v2(
    app: AppHandle,
    sku: String,
    folder_type: String,
    shopify_urls: Vec<String>,
    amazon_urls: Vec<String>,
) -> Result<String, String> {
    // 分割数组值
    let shopify_len = shopify_urls.len();
    // 并发获取图片数据
    let handle_image = async {
        let urls = [shopify_urls, amazon_urls].concat(); // 合并两个 URL 列表

        let requests: Vec<_> = urls
            .into_iter()
            .map(|url| {
                spawn(async move {
                    let result = reqwest::get(&url).await.map_err(|_| "请求失败")?;
                    let bytes = result.bytes().await.map_err(|_| "获取字节失败")?;
                    Ok::<ImgResponse<Vec<u8>>, String>(ImgResponse {
                        url,
                        result: bytes.to_vec(),
                    })
                })
            })
            .collect();

        // 执行并发请求
        let responses = join_all(requests).await;

        responses
    };

    // 比对逻辑
    let result = spawn(async move {
        let imgs_result = handle_image.await;

        // 将结果分组
        let shopify_images: Vec<_> = imgs_result.iter().take(shopify_len).collect();
        let amazon_images: Vec<_> = imgs_result.iter().skip(shopify_len).collect();

        // 存储比对结果
        let mut comparison_results = Vec::new();
        let mut is_update = false;

        // 进行图片比对
        for (index, shopify_image) in shopify_images.iter().enumerate() {
            if let Some(amazon_image) = amazon_images.get(index) {
                let shopify = shopify_image.as_ref().ok().unwrap().as_ref().ok().unwrap();
                let shopify_img_u8 = &shopify.result;
                let amazon = amazon_image.as_ref().ok().unwrap().as_ref().ok().unwrap();
                let amazon_img_u8 = &amazon.result;

                let shopify_img = v8_to_img(shopify_img_u8.to_vec());
                let amazon_img = v8_to_img(amazon_img_u8.to_vec());

                let mut is_equal = false;

                let mut matcher = TemplateMatcher::new();
                matcher.match_template(
                    shopify_img,
                    amazon_img,
                    MatchTemplateMethod::SumOfSquaredDifferences,
                );
                let result = matcher.wait_for_result().unwrap();
                let result_extremes = find_extremes(&result);

                if result_extremes.min_value > 100.0 || result_extremes.max_value > 100.0 {
                    is_equal = true;
                    is_update = true;
                }

                comparison_results.push(ComparisonResult {
                    index,
                    shopify_url: shopify.url.to_string(),
                    amazon_url: amazon.url.to_string(),
                    is_equal,
                    download: amazon_img_u8.clone(),
                });
            }
        }

        if is_update {
            let folder_path = Path::new(&sku).join(&folder_type);
            let full_folder_path = create_folder(app, folder_path.to_string_lossy().to_string());

            comparison_results
                .iter()
                .enumerate()
                .for_each(|(index, item)| {
                    let file_name = format!("{}-{}.png", sku, index);
                    let save_path = Path::new(&full_folder_path).join(file_name);
                    // println!("save_path: {:?}", save_path);
                    let _ = fs::write(save_path, &item.download)
                        .map_err(|e| format!("写入文件错误: {}", e));
                });
        }

        is_update
    })
    .await;

    // 等待结果
    // let output = result.await.unwrap_or_else(|_| "任务执行失败".to_string());

    // Ok(output)
    match result {
        Ok(val) => Response::new_result(1, Some(val), None),
        Err(e) => Response::<bool>::new_result(
            0,
            Some(false),
            Some(format!("task_amazon_images_diff_v2 失败: {}", e)),
        ),
    }
}

#[derive(Debug, serde::Serialize)]
struct ImgResponse<T> {
    url: String,
    result: T,
}

struct ComparisonResult {
    index: usize,
    shopify_url: String,
    amazon_url: String,
    is_equal: bool,
    download: Vec<u8>,
}
