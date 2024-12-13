use tauri::command;

use headless_chrome::{Browser, LaunchOptions, Tab};
use std::sync::Arc;
use std::time::Duration;
use tokio::task;

use super::{
    common_mod::start_browser,
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

        // let _ = tab.0.close_target();
        push_web_log(WebLog::new_default("完成").with_msg_arr(vec![&url]));
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

pub mod task_fin_goods_detail {
    use tauri::command;
    use tokio::task::spawn_blocking;

    use crate::modules::{common_mod::start_browser, other_model::Response};

    #[command]
    pub async fn task_fin_goods_detail(url: String) -> Result<String, String> {
        let result = spawn_blocking(move || {
            // push_web_log(WebLog::new_title("获取商品详情:").with_msg_arr(vec![&url]));

            // 商品轮播图
            // 商品价格
            // 商品详情
            // 商品描述文案
            // 商品功能与规格
            // 商品详情内容(图 + 数据json)
        })
        .await;

        Ok("".to_string())
    }
}
