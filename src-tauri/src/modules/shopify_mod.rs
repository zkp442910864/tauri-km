use std::{fs, path::Path, sync::Arc, thread::sleep, time::Duration};

use headless_chrome::{
    browser::tab::ModifierKey,
    protocol::cdp::Network::{CookieParam, CookiePriority, CookieSameSite},
    Element, Tab,
};
use serde_json::json;
use tauri::{command, AppHandle, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_store::{Store, StoreExt};
use tokio::task::spawn_blocking;

use super::{
    common_mod::{create_folder, start_browser},
    other_model::{Response, TParseTypeMsg, PARSE_TYPE_MAP},
    MY_BROWSER,
};

/** 打开有头页面,让用户登录 */
#[command]
pub async fn task_shopify_store_login(app: AppHandle, url: String) -> Result<String, String> {
    let browser = &MY_BROWSER;
    let result = spawn_blocking(move || {
        let store = app.store("shopify_store_cookies").unwrap();
        let tab = browser.new_tab().unwrap();
        let t_id = tab.get_target_id();

        let koa_val = store
            .get("koa_val")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default();
        let koa_sig_val = store
            .get("koa_sig_val")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default();
        let _merchant_essential = store
            .get("_merchant_essential")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default();
        let _shopify_essential_ = store
            .get("_shopify_essential_")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default();

        let _ = tab
            .set_cookies(vec![
                CookieParam {
                    domain: Some("admin.shopify.com".to_string()),
                    url: None,
                    name: "koa.sid".to_string(),
                    value: koa_val,
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
                    value: koa_sig_val,
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
                    name: "_merchant_essential".to_string(),
                    value: _merchant_essential,
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
                    name: "_shopify_essential_".to_string(),
                    value: _shopify_essential_,
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
    app: AppHandle,
    url: String,
    tab_id: String,
) -> Result<String, String> {
    let result = spawn_blocking(move || {
        let store = app.store("shopify_store_cookies").unwrap();
        let tab = find_tab_v2(tab_id.as_str()).unwrap();
        let cookies_warp = tab
            .get_cookies()
            .map_err(|e| {
                println!("Log::::cookies::::{}", e);
            })
            .unwrap();
        let mut cookies = cookies_warp.iter();
        let koa_sig = cookies.find(|ii| ii.name == "koa.sid.sig");
        let koa = cookies.find(|ii| ii.name == "koa.sid");
        let _merchant_essential = cookies.find(|ii| ii.name == "_merchant_essential");
        let _shopify_essential_ = cookies.find(|ii| ii.name == "_shopify_essential_");

        println!("Log::::cookies::::before in");
        // println!("Log::::cookies::::{:?}", koa);
        // println!("Log::::cookies::::{:?}", koa_sig);
        // stores.insert("koa", koa);
        let mut flag = match (koa, koa_sig) {
            (Some(koa_val), Some(koa_sig_val)) => {
                store.set("koa_val", json!(koa_val.value));
                store.set("koa_sig_val", json!(koa_sig_val.value));
                true
            }
            _ => false,
        };
        if flag {
            println!("Log::::cookies:::loginSuccess");
            flag = match (_merchant_essential, _shopify_essential_) {
                (Some(_merchant_essential_val), Some(_shopify_essential_val)) => {
                    println!("Log::::cookies:::need data Ok?");

                    store.set("_merchant_essential", json!(_merchant_essential_val.value));
                    store.set("_shopify_essential", json!(_shopify_essential_val.value));
                    true
                }
                _ => {
                    println!("Log::::cookies:::need data fail");
                    true
                },
            };
        }
        // let flag = cookies.find(|ii| match ii.name.find("koa.sid") {
        //     Some(_) => true,
        //     None => false,
        // });

        let _ = tab.close(true);

        // match flag {
        //     Some(_) => true,
        //     None => false,
        // }
        flag
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
    let result = spawn_blocking(move || -> String {
        let (tab, _) = start_browser(&url).unwrap();

        confirm_loading(
            &tab,
            true,
            Some("#pinned-metafields-anchor>s-section>div>div>div>div:nth-child(2)>div>div:nth-child(1)"),
        );
        confirm_loading(&tab, false, None);

        tab.get_target_id().to_string()
    })
    .await;

    match result {
        Ok(t_id) => Response::new_result(1, Some(t_id), None),
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
                let el = tab.find_element("div[id^=richtexteditor_toolbar-product-description] div[class^=_AdditionalActionsContainer] button").unwrap();
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

                    confirm_loading(&inline_tab, true, Some("input[name=price]"));

                    let move_el = inline_tab.find_element(".Polaris-InlineStack>.Polaris-Box>button[type=\"button\"]").unwrap();
                    let _ = move_el.click();

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
                if data != "" {
                    let _ = tab.press_key("Enter");
                }
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
                let el = tab.find_element("#pinned-metafields-anchor>s-section>div>div>div>div:nth-child(2)").unwrap();
                quick_adhesive_value(&app, &el, &tab, &data);
                let _ = tab.find_element("#pinned-metafields-anchor>s-section>div>div>h2").unwrap().click();
            },
            Some(TParseTypeMsg::GetChoice) => {
                let el = tab.find_element("#pinned-metafields-anchor>s-section>div>div>div>div:nth-child(6)").unwrap();
                let _ = el.click();
                sleep(Duration::from_millis(100));

                if data == "1" {
                    let _ = tab.press_key("ArrowDown");
                    sleep(Duration::from_millis(100));
                    let _ = tab.press_key("ArrowDown");
                }
                else {
                    let _ = tab.press_key("ArrowDown");
                }
                sleep(Duration::from_millis(100));
                let _ = tab.find_element("#pinned-metafields-anchor>s-section>div>div>h2").unwrap().click();
            },
            Some(TParseTypeMsg::GetReviewData) => {
                let el = tab.find_element("#pinned-metafields-anchor>s-section>div>div>div>div:nth-child(7)").unwrap();
                quick_adhesive_value(&app, &el, &tab, &data);
                let _ = tab.find_element("#pinned-metafields-anchor>s-section>div>div>h2").unwrap().click();
            },
            Some(TParseTypeMsg::GetFeaturesSpecs) => {
                let el = tab.find_element("#pinned-metafields-anchor>s-section>div>div>div>div:nth-child(2)").unwrap();
                quick_adhesive_value(&app, &el, &tab, &data);
                let _ = tab.find_element("#pinned-metafields-anchor>s-section>div>div>h2").unwrap().click();
            },
            Some(TParseTypeMsg::GetContentJson) => {
                let _ = tab.find_element("#pinned-metafields-anchor>s-section>div>div>h2").unwrap().click();
                // let _ = tab.find_element("#pinned-metafields-anchor>div.Polaris-Card>div>div>div>.Polaris-Text--root").unwrap().click();
                let el = tab.find_element("#pinned-metafields-anchor>s-section>div>div>div>div:nth-child(5)").unwrap();
                quick_adhesive_value(&app, &el, &tab, &data);
                let _ = tab.find_element("#pinned-metafields-anchor>s-section>div>div>h2").unwrap().click();
            },
            Some(TParseTypeMsg::AmazonAddressUrl) => {
                let el = tab.find_element("#pinned-metafields-anchor>s-section>div>div>div>div:nth-child(1)").unwrap();
                let _ = app.clipboard().write_text(data);
                let _ = el.click();
                sleep(Duration::from_millis(500));
                let _ = tab.press_key("Tab");
                let _ = tab.press_key_with_modifiers("v", Some(&[ModifierKey::Ctrl]));
                sleep(Duration::from_millis(500));
                let _ = tab.find_element("#pinned-metafields-anchor>s-section>div>div>h2").unwrap().click();
            },
            Some(TParseTypeMsg::GetSkuModel) => {
                let _ = tab.find_element("form>div>div>div:nth-child(2)>div>div>div>div").unwrap().click();
                sleep(Duration::from_millis(1000));

                // let el = tab.find_element("._Header_1eydo_1").unwrap();
                // let _ = el.click();
                // sleep(Duration::from_millis(1000));
                // let metadata_btn_warp = tab.find_element("._Header_1eydo_1 button");
                // if let Ok(_) = metadata_btn_warp {
                //     each_tab_do(&tab, 5);
                // }
                // else {
                //     each_tab_do(&tab, 3);
                // }
                each_tab_do(&tab, 5);
                let _ = app.clipboard().write_text(data);
                let _ = tab.press_key_with_modifiers("v", Some(&[ModifierKey::Ctrl]));
                // each_tab_do(&tab, 3);
                // sleep(Duration::from_millis(500));
                let _ = tab.press_key("Enter");
            }
            Some(TParseTypeMsg::GetSkuModelAdd) => {
                let _ = tab.find_element("form>div>div>div:nth-child(2)>div>div>div>div").unwrap().click();
                sleep(Duration::from_millis(1000));
                let el = tab.find_element("button[aria-haspopup=listbox]").unwrap();

                let _ = app.clipboard().write_text(data);
                let _ = el.click();
                let _ = tab.press_key("m");
                let _ = tab.press_key("o");
                let _ = tab.press_key("d");
                let _ = tab.press_key("e");
                let _ = tab.press_key("l");
                let box_wrap = tab.find_element("[id^=expanded-option]");
                let btn_el_wrap = tab.find_element(".Polaris-Box>button");
                if let (Err(_), Ok(btn_el)) = (box_wrap, btn_el_wrap) {
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
            Some(TParseTypeMsg::GetContentImgs) => {
                let _ = tab.find_element("#pinned-metafields-anchor>s-section>div>div>div>div:nth-child(4)").unwrap().click();
                sleep(Duration::from_millis(1000));
                // let _ = tab.press_key("Enter");

                let clear_btn_warp = tab.find_element("div[class^=_EditField_] div:not([class]):not([style])>div>div.Polaris-LegacyStack>div:nth-child(2)");
                if let Ok(clear_btn) = clear_btn_warp {
                    let _ = clear_btn.click();
                    sleep(Duration::from_millis(500));
                }

                let _ = tab.find_element("div[class^=_EditField_] div:not([class]):not([style])>div>div.Polaris-LegacyStack>div:nth-child(1)").unwrap().click();
                sleep(Duration::from_millis(1000));

                let upload_input = tab.find_element("div[role=dialog] input[type=file]").unwrap();
                let img_len = page_upload_imgs(&app, &upload_input, &sku, "desc");

                if img_len > 0 {
                    confirm_loading(&tab, false, Some("div[role=dialog] button[class^=_CancelButton]"));
                    confirm_loading(&tab, true, Some("div[role=dialog] div[class^=_HeaderIcon]"));

                    sleep(Duration::from_millis(1000));
                    let _ = tab.find_element("div[role=dialog] .Polaris-Modal-Footer button.Polaris-Button--variantPrimary").unwrap().click();
                    sleep(Duration::from_millis(1000));
                    let _ = tab.find_element("#pinned-metafields-anchor>s-section>div>div>h2").unwrap().click();
                }
                else {
                    let _ = tab.find_element("div[role=dialog] .Polaris-Modal-Footer button.Polaris-Button--variantSecondary").unwrap().click();
                    sleep(Duration::from_millis(1000));
                }

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

fn page_upload_imgs(app: &AppHandle, el: &Element<'_>, sku: &str, folder_type: &str) -> usize {
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
    if urls.len() > 0 {
        let url_refs: Vec<&str> = urls.iter().map(|s| s.as_str()).collect();
        let _ = el.set_input_files(&url_refs);
    }
    urls.len()
}

/** 保存并关闭页面 */
#[command]
pub async fn task_shopify_store_product_finish(tab_id: String) -> Result<String, String> {
    let result = spawn_blocking(move || {
        let tab = find_tab_v2(tab_id.as_str()).unwrap();
        let save_el = tab.find_element("button[type=submit]").unwrap();
        let _ = save_el.click();
        sleep(Duration::from_millis(5000));

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

/**
 * wait_append true等待元素出现,false等待元素消失
 */
fn confirm_loading(tab: &Arc<Tab>, wait_append: bool, keywords: Option<&str>) {
    loop {
        let key = if let Some(val) = keywords {
            val
        } else {
            "div[class^=Polaris-Skeleton]"
        };
        let el_warp = tab.find_element(key);

        if wait_append {
            if let Ok(_) = el_warp {
                return;
            } else {
                sleep(Duration::from_millis(1000));
            }
        } else {
            if let Ok(_) = el_warp {
                sleep(Duration::from_millis(1000));
            } else {
                return;
            }
        }
    }
}
