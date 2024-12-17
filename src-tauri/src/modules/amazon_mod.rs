use tauri::{command, AppHandle};

use headless_chrome::{Browser, LaunchOptions, Tab};
use std::sync::Arc;
use std::time::Duration;
use tokio::task::{self, spawn_blocking};
use std::{borrow::Cow, fs, path::Path, thread::sleep};

use super::{
    common_mod::{click_point, page_screenshot, start_browser},
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
        let buttons = tab.find_elements("button");

        match buttons {
            Ok(btns) => {
                let btn = btns.into_iter().find(|item| {
                    // let Ok(val) = item.get_inner_text().map_err(|e| format!("val {}", e));
                    if let Ok(val) = item.get_inner_text() {
                        // println!("button text: {}", val);
                        val == "Show more"
                    } else {
                        false
                    }
                });
                if let Some(btn_instance) = btn {
                    let _ = btn_instance.click();
                    true
                } else {
                    false
                }
            }
            Err(_) => false,
        }
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
        let mut flag = true;

        std::thread::sleep(Duration::from_secs(1));
        while flag {
            if trigger_more_btn(tab) || has_loading(tab) {
                std::thread::sleep(Duration::from_secs(1));
            } else {
                flag = false;
            }
        }
    };

    // 提取数据
    let extract_sku = |tab: &Arc<Tab>| {
        push_web_log(WebLog::new_default("提取页面sku数据"));

        let li_val = tab.wait_for_elements("div>ul>li");
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
            }
            else if count > max_count {
                return true;
            }
            else {
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
        while flag && count < max_count  {
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
                break;
                // handle_check_page(&tab);
                // sleep(Duration::from_secs(10));
                // let _ = tab.navigate_to(&url);
                // continue;
            }
            flag = find_assign_dom(&tab);
            if flag {
                println!("Log::::no find dom");
                // tab.delete_cookies(cs);
                let _ = tab.navigate_to(&url);
                continue;
            }
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
