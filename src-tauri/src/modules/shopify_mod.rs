use std::{fs, path::Path, sync::Arc, thread::sleep, time::Duration};

use headless_chrome::{
    browser::tab::ModifierKey,
    protocol::cdp::Network::{CookieParam, CookiePriority, CookieSameSite},
    Element, Tab,
};
use tauri::{command, AppHandle};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::task::spawn_blocking;

use super::{
    common_mod::{create_folder, start_browser},
    other_model::{Response, TParseTypeMsg, PARSE_TYPE_MAP},
    MY_BROWSER,
};

/** 打开有头页面,让用户登录 */
#[command]
pub async fn task_shopify_store_login(url: String) -> Result<String, String> {
    let browser = &MY_BROWSER;
    let result = spawn_blocking(move || {
        // let (tab, _) = start_browser(&url).unwrap();
        let tab = browser.new_tab().unwrap();
        let t_id = tab.get_target_id();

        let _ = tab
            .set_cookies(vec![
                CookieParam {
                    domain: Some("admin.shopify.com".to_string()),
                    url: None,
                    name: "koa.sid".to_string(),
                    value: "xxx".to_string(),
                    expires: None,
                    http_only: Some(true),
                    partition_key: None,
                    path: Some("/".to_string()),
                    priority: Some(CookiePriority::Medium),
                    same_party: None,
                    same_site: Some(CookieSameSite::Lax),
                    secure: Some(true),
                    source_port: None,
                    source_scheme: None,
                },
                CookieParam {
                    domain: Some("admin.shopify.com".to_string()),
                    url: None,
                    name: "koa.sid.sig".to_string(),
                    value: "xxx".to_string(),
                    expires: None,
                    http_only: Some(true),
                    partition_key: None,
                    path: Some("/".to_string()),
                    priority: Some(CookiePriority::Medium),
                    same_party: None,
                    same_site: Some(CookieSameSite::Lax),
                    secure: Some(true),
                    source_port: None,
                    source_scheme: None,
                },
            ])
            .and_then(|_| tab.navigate_to(&url))
            .and_then(|_| tab.wait_until_navigated());

        t_id.to_string()
    })
    .await;

    match result {
        Ok(val) => Response::new_result(1, Some(val), None),
        Err(e) => Response::<String>::new_result(0, None, Some(format!("异步任务失败: {}", e))),
    }
}

/** 确认登录状态,并关闭页面 */
#[command]
pub async fn task_shopify_store_login_status(
    url: String,
    tab_id: String,
) -> Result<String, String> {
    let result = spawn_blocking(move || {
        let tab = find_tab_v2(tab_id.as_str()).unwrap();
        let cookies_warp = tab
            .get_cookies()
            .map_err(|e| {
                println!("Log::::cookies::::{}", e);
            })
            .unwrap();
        let mut cookies = cookies_warp.iter();
        let flag = cookies.find(|ii| match ii.name.find("koa.sid") {
            Some(_) => true,
            None => false,
        });

        let _ = tab.close(true);

        match flag {
            Some(_) => true,
            None => false,
        }
    })
    .await;

    match result {
        Ok(val) => Response::new_result(1, Some(val), None),
        Err(e) => Response::new_result(0, Some(false), Some(format!("异步任务失败: {}", e))),
    }
}

/** 打开编辑页面 */
#[command]
pub async fn task_shopify_store_product_open(url: String) -> Result<String, String> {
    let result = start_browser(&url).map_err(|e| format!("创建失败 {}", e));

    match result {
        Ok((tab, _)) => Response::new_result(1, Some(tab.get_target_id()), None),
        Err(e) => Response::new_result(0, Some(false), Some(format!("异步任务失败: {}", e))),
    }
}

/** 接受指令类型,执行不同操作 */
#[command]
pub async fn task_shopify_store_product_update_item(
    app: AppHandle,
    url: String,
    input_type: String,
    data: String,
    tab_id: String,
    sku: String,
) -> Result<String, String> {
    let result = spawn_blocking(move || {
        let tab: Arc<Tab> = find_tab_v2(tab_id.as_str()).unwrap();

        match PARSE_TYPE_MAP.get(&input_type) {
            Some(TParseTypeMsg::GetTitle) => {
                let el = tab.find_element("input[name=title]").unwrap();
                quick_adhesive_value(&app, &el, &tab, &data);
            }
            Some(TParseTypeMsg::GetDescText) => {
                let el = tab.find_element("#richtexteditor_toolbar-product-description div[class^=_AdditionalActionsContainer] button").unwrap();
                quick_adhesive_value(&app, &el, &tab, &data);
                let _ = el.click();
            }
            Some(TParseTypeMsg::GetPrice) => {
                let mut data_arr = data.split("&&");
                let mut data_arr_copy = data_arr.clone();

                if let (Some(v_id), Some(price), Some(old_price)) =
                    (data_arr.next(), data_arr.next(), data_arr.next())
                {
                    let v_url = format!("{}/variants/{}", url, v_id);
                    let (inline_tab, _) = start_browser(&v_url).unwrap();

                    let price_el = inline_tab.find_element("input[name=price]").unwrap();
                    quick_adhesive_value(&app, &price_el, &inline_tab, price);

                    let old_price_el = inline_tab.find_element("input[name=compareAtPrice]").unwrap();
                    let old_price_val = if old_price == "-1" { "" } else { old_price };
                    quick_adhesive_value(&app, &old_price_el, &inline_tab, old_price_val);

                    let save_el = inline_tab.find_element("button[type=submit]").unwrap();
                    let _ = save_el.click();
                    sleep(Duration::from_millis(2000));
                    let _ = inline_tab.close(true);
                }
                else if let (Some(price), Some(old_price)) = (data_arr_copy.next(), data_arr_copy.next()) {
                    // 不同处理
                    todo!("匹配出问题 {}", input_type)
                }
            }
            Some(TParseTypeMsg::GetPriceAdd) => {
                let mut data_arr = data.split("&&");
                if let (Some(price), Some(old_price)) = (data_arr.next(), data_arr.next()) {
                    let el = tab.find_element("input[name=price]").unwrap();
                    quick_adhesive_value(&app, &el, &tab, price);

                    let el2 = tab.find_element("input[name=compareAtPrice]").unwrap();
                    let old_price_val = if old_price == "-1" { "" } else { old_price };
                    quick_adhesive_value(&app, &el2, &tab, old_price_val);
                }
            }
            Some(TParseTypeMsg::GetRelevanceTag) => {
                let _ = tab.evaluate("
                    (() => {
                        [
                            ...document.querySelector('input[name=tags]')
                                .parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.nextElementSibling
                                .querySelectorAll('span[title^=关联]')
                        ].reverse().forEach((el) => {
                            const btn = el.parentElement.nextElementSibling;
                            setTimeout(() => btn.click(), 16);
                        });
                    })()
                ", false);

                let el = tab.find_element("input[name=tags]").unwrap();
                quick_adhesive_value(&app, &el, &tab, &data);
                sleep(Duration::from_millis(2000));
                let _ = tab.press_key("Enter");
            }
            Some(TParseTypeMsg::AmazonProductBrandAdd) => {
                let el = tab.find_element("input[name=vendor]").unwrap();
                let _ = el.click();
                sleep(Duration::from_millis(1000));
                let _ = tab.press_key("Enter");
            }
            Some(TParseTypeMsg::AmazonProductCollectionsAdd) => {
                let el = tab.find_element("input[name=collections]").unwrap();
                let cols = data.split(",");
                cols.for_each(|val| {
                    let _ = app.clipboard().write_text(val);
                    let _ = el.click();
                    sleep(Duration::from_millis(100));

                    let _ = tab.press_key_with_modifiers("a", Some(&[ModifierKey::Ctrl]));
                    let _ = tab.press_key_with_modifiers("a", Some(&[ModifierKey::Ctrl]));
                    let _ = tab.press_key_with_modifiers("v", Some(&[ModifierKey::Ctrl]));
                    sleep(Duration::from_millis(2000));
                    let _ = tab.press_key("Enter");
                });
            }
            Some(TParseTypeMsg::GetDetail) => {
                let el = tab.find_element("#pinned-metafields-anchor>div>div>div>div:nth-child(2)>div>div:nth-child(2)").unwrap();
                quick_adhesive_value(&app, &el, &tab, &data);
                let _ = tab.find_element("#pinned-metafields-anchor>div>div>div>div:nth-child(1)>h2").unwrap().click();
            },
            Some(TParseTypeMsg::GetFeaturesSpecs) => {
                let el = tab.find_element("#pinned-metafields-anchor>div>div>div>div:nth-child(2)>div>div:nth-child(3)").unwrap();
                quick_adhesive_value(&app, &el, &tab, &data);
                let _ = tab.find_element("#pinned-metafields-anchor>div>div>div>div:nth-child(1)>h2").unwrap().click();
            },
            Some(TParseTypeMsg::GetContentJson) => {
                let el = tab.find_element("#pinned-metafields-anchor>div>div>div>div:nth-child(2)>div>div:nth-child(5)").unwrap();
                quick_adhesive_value(&app, &el, &tab, &data);
                let _ = tab.find_element("#pinned-metafields-anchor>div>div>div>div:nth-child(1)>h2").unwrap().click();
            },
            Some(TParseTypeMsg::AmazonAddressUrl) => {
                let el = tab.find_element("#pinned-metafields-anchor>div>div>div>div:nth-child(2)>div>div:nth-child(1)").unwrap();
                let _ = app.clipboard().write_text(data);
                let _ = el.click();
                sleep(Duration::from_millis(500));
                let _ = tab.press_key("Tab");
                let _ = tab.press_key_with_modifiers("v", Some(&[ModifierKey::Ctrl]));
                sleep(Duration::from_millis(500));
                let _ = tab.find_element("#pinned-metafields-anchor>div>div>div>div:nth-child(1)>h2").unwrap().click();
            },
            Some(TParseTypeMsg::GetSkuModel) => {
                let el = tab.find_element("._Header_1eydo_1").unwrap();
                let _ = el.click();
                sleep(Duration::from_millis(1000));
                each_tab_do(&tab, 5);
                let _ = app.clipboard().write_text(data);
                let _ = tab.press_key_with_modifiers("v", Some(&[ModifierKey::Ctrl]));
                each_tab_do(&tab, 3);
                sleep(Duration::from_millis(500));
                let _ = tab.press_key("Enter");
            }
            Some(TParseTypeMsg::GetSkuModelAdd) => {
                let el = tab.find_element("button[aria-haspopup=listbox]").unwrap();

                let _ = app.clipboard().write_text(data);
                let _ = el.click();
                let _ = tab.press_key("m");
                let _ = tab.press_key("o");
                let _ = tab.press_key("d");
                let _ = tab.press_key("e");
                let _ = tab.press_key("l");
                let btn_el_wrap = tab.find_element(".Polaris-Box>button");
                if let Ok(btn_el) = btn_el_wrap {
                    let _ = btn_el.click();
                }
                sleep(Duration::from_millis(1000));
                each_tab_do(&tab, 1);
                sleep(Duration::from_millis(100));
                let _ = tab.press_key_with_modifiers("v", Some(&[ModifierKey::Ctrl]));
                sleep(Duration::from_millis(500));
                each_tab_do(&tab, 3);
                sleep(Duration::from_millis(500));
                let _ = tab.press_key("Enter");
            }
            Some(TParseTypeMsg::AmazonProductSkuAdd) => {
                let el = tab.find_element("input[name=sku]").unwrap();
                quick_adhesive_value(&app, &el, &tab, &data);

                let el_btn = tab.find_element("#seo .Polaris-Text--root+span button").unwrap();
                let _ = el_btn.click();
                each_tab_do(&tab, 2);
                sleep(Duration::from_millis(100));
                let _ = tab.press_key_with_modifiers("v", Some(&[ModifierKey::Ctrl]));
            }
            Some(TParseTypeMsg::GetBannerImgsAdd) => {
                let el = tab.find_element("input[type=file]").unwrap();

                page_upload_imgs(&app, &el, &sku, "banner");
                page_upload_imgs(&app, &el, &sku, "banner");

                loop {
                    let el_warp = tab.find_element(".Polaris-Spinner");
                    if let Ok(_) = el_warp {
                        sleep(Duration::from_millis(1000));
                    }
                    else {
                        break;
                    }
                }
            }
            Some(TParseTypeMsg::GetContentImgsAdd) => {
                let _ = tab.find_element("#pinned-metafields-anchor>div>div>div>div:nth-child(2)>div>div:nth-child(4)").unwrap().click();
                sleep(Duration::from_millis(100));
                let _ = tab.press_key("Enter");

                sleep(Duration::from_millis(1000));
                let upload_input = tab.find_element("div[role=dialog] input[type=file]").unwrap();
                page_upload_imgs(&app, &upload_input, &sku, "desc");

                loop {
                    let el_warp = tab.find_element("div[role=dialog] button[class^=_CancelButton]");
                    if let Ok(el) = el_warp {
                        sleep(Duration::from_millis(1000));
                    }
                    else {
                        sleep(Duration::from_millis(2000));
                        break;
                    }
                }

                sleep(Duration::from_millis(1000));
                let _ = tab.find_element("div[role=dialog] .Polaris-Modal-Footer button.Polaris-Button--variantPrimary").unwrap().click();
                sleep(Duration::from_millis(1000));
                let _ = tab.find_element("#pinned-metafields-anchor>div>div>div>div:nth-child(1)>h2").unwrap().click();
            }
            // Some(TParseTypeMsg::GetSkuModel) => {},
            // Some(TParseTypeMsg::GetDescText) => {},
            // Some(TParseTypeMsg::GetBannerImgs) => {},
            // Some(TParseTypeMsg::GetBannerImgs) => {},
            None => todo!("缺少未匹配的1 {}", input_type),
            _ => todo!("缺少未匹配的2 {}", input_type),
        }

        true
    })
    .await;

    match result {
        Ok(val) => Response::new_result(1, Some(val), None),
        Err(e) => Response::new_result(0, Some(false), Some(format!("异步任务失败: {}", e))),
    }
}

fn page_upload_imgs(app: &AppHandle, el: &Element<'_>, sku: &str, folder_type: &str) {
    let path_url = Path::new(&sku).join(folder_type);
    let folder_path = create_folder(app.clone(), path_url.to_string_lossy().to_string());
    let urls: Vec<String> = fs::read_dir(folder_path)
        .unwrap()
        .map(|entry| {
            let entry = entry.unwrap();
            let img_path = entry.path();
            img_path.to_string_lossy().to_string()
        })
        .collect();
    let url_refs: Vec<&str> = urls.iter().map(|s| s.as_str()).collect();
    let _ = el.set_input_files(&url_refs);
}

/** 保存并关闭页面 */
#[command]
pub async fn task_shopify_store_product_finish(tab_id: String) -> Result<String, String> {
    let result = spawn_blocking(move || {
        let tab = find_tab_v2(tab_id.as_str()).unwrap();
        let save_el = tab.find_element("button[type=submit]").unwrap();
        let _ = save_el.click();
        sleep(Duration::from_millis(2000));

        let _ = tab.close(true);
        true
    })
    .await;

    match result {
        Ok(val) => Response::new_result(1, Some(val), None),
        Err(e) => Response::new_result(0, Some(false), Some(format!("异步任务失败: {}", e))),
    }
}

fn find_tab_v2(tab_id: &str) -> Option<Arc<Tab>> {
    let browser = &MY_BROWSER;

    // 锁住 Tabs 并获取
    let tabs_warp = browser.get_tabs().as_ref().lock().unwrap();

    // 使用迭代器查找符合条件的 tab
    tabs_warp
        .iter()
        .find(|t| t.get_target_id() == tab_id)
        .cloned()
}

fn quick_adhesive_value(app: &AppHandle, el: &Element<'_>, tab: &Arc<Tab>, new_val: &str) {
    let _ = app.clipboard().write_text(new_val);
    let _ = el.click();
    sleep(Duration::from_millis(1000));
    let _ = tab.press_key_with_modifiers("a", Some(&[ModifierKey::Ctrl]));
    sleep(Duration::from_millis(500));
    let _ = tab.press_key_with_modifiers("a", Some(&[ModifierKey::Ctrl]));
    sleep(Duration::from_millis(1000));
    if new_val == "" {
        let _ = tab.press_key("Backspace");
    } else {
        let _ = tab.press_key_with_modifiers("v", Some(&[ModifierKey::Ctrl]));
    }
    sleep(Duration::from_millis(1000));
}

fn each_tab_do(tab: &Arc<Tab>, count: usize) {
    for _ in 1..=count {
        let _ = tab.press_key("Tab");
    }
}