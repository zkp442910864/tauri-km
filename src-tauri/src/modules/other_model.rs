use phf::phf_map;
use serde::{Deserialize, Serialize};

/// Tauri 命令统一返回结构 —— 所有命令都通过此结构序列化后返回给前端。
///
/// 前端通过 `JSON.parse(res) as ITauriResponse<T>` 解析。
/// - `status: 1` 表示成功，`0` 表示失败
/// - `data` 为业务数据
/// - `message` 为错误信息（仅失败时有值）
#[derive(Serialize, Deserialize, std::fmt::Debug)]
pub struct Response<T = String>
where
    T: Serialize + std::fmt::Debug,
{
    pub status: u32,
    pub data: Option<T>,
    pub message: Option<String>,
}

impl<T> Response<T>
where
    T: Serialize + std::fmt::Debug,
{
    pub fn new_result(
        status: u32,
        data: Option<T>,
        message: Option<String>,
    ) -> Result<String, String> {
        // Self { status, data, message };
        if status == 1 {
            serde_json::to_string(&Self {
                status,
                data,
                message,
            })
            .map_err(|e| format!("success: {}", e))
        } else {
            serde_json::to_string(&Self {
                status,
                data,
                message,
            })
            .map_err(|e| format!("fail: {}", e))
        }
    }

    pub fn new(status: u32, data: Option<T>, message: Option<String>) -> Self {
        Self {
            status,
            data,
            message,
        }
    }
}

/// 浏览器实例状态标记 —— 用于跟踪 headless_chrome 是否已初始化。
pub struct BrowserStatus {
    status: bool,
}

impl BrowserStatus {
    pub fn new() -> Self {
        Self { status: false }
    }

    pub fn set_status(&mut self, val: bool) {
        self.status = val;
    }

    pub fn get_status(&self) -> bool {
        self.status
    }
}

/// HTML 解析类型枚举 —— 标识从 Amazon/Shopify 页面中提取的数据字段。
///
/// 每个枚举值对应一种数据提取操作，用于在前端和 Rust 端之间统一标识解析类型。
#[derive(Debug)]
pub enum TParseTypeMsg {
    GetTitle,
    AmazonAddressUrl,
    GetBannerImgs,
    GetPrice,
    GetDetail,
    GetDescText,
    GetFeaturesSpecs,
    GetContentJson,
    GetReviewData,
    GetSkuModel,
    ShopifyProductId,
    GetContentImgs,
    GetPriceNoPrice,
    GetContentJsonError,
    GetRelevanceTag,
    GetPriceAdd,
    GetSkuModelAdd,
    AmazonProductSkuAdd,
    GetBannerImgsAdd,
    AmazonProductBrandAdd,
    AmazonProductCollectionsAdd,
    GetChoice,
}

/// 静态哈希映射 —— 将前端传入的字符串类型标识映射为 `TParseTypeMsg` 枚举。
///
/// 支持 `.add` 后缀变体（用于新增产品场景）。
pub static PARSE_TYPE_MAP: phf::Map<&'static str, TParseTypeMsg> = phf_map! {
    "get_title" => TParseTypeMsg::GetTitle,
    "get_title.add" => TParseTypeMsg::GetTitle,
    "amazon_address_url" => TParseTypeMsg::AmazonAddressUrl,
    "amazon_address_url.add" => TParseTypeMsg::AmazonAddressUrl,
    "get_price" => TParseTypeMsg::GetPrice,
    "get_price.add" => TParseTypeMsg::GetPriceAdd,
    "get_detail" => TParseTypeMsg::GetDetail,
    "get_detail.add" => TParseTypeMsg::GetDetail,
    "get_desc_text" => TParseTypeMsg::GetDescText,
    "get_desc_text.add" => TParseTypeMsg::GetDescText,
    "get_features_specs" => TParseTypeMsg::GetFeaturesSpecs,
    "get_features_specs.add" => TParseTypeMsg::GetFeaturesSpecs,
    "get_content_json" => TParseTypeMsg::GetContentJson,
    "get_content_json.add" => TParseTypeMsg::GetContentJson,
    "get_review_data" => TParseTypeMsg::GetReviewData,
    "get_review_data.add" => TParseTypeMsg::GetReviewData,
    "get_sku_model" => TParseTypeMsg::GetSkuModel,
    "get_sku_model.add" => TParseTypeMsg::GetSkuModelAdd,
    "get_relevance_tag" => TParseTypeMsg::GetRelevanceTag,
    "get_relevance_tag.add" => TParseTypeMsg::GetRelevanceTag,
    "amazon_product_sku.add" => TParseTypeMsg::AmazonProductSkuAdd,
    "get_banner_imgs" => TParseTypeMsg::GetBannerImgs,
    "get_banner_imgs.add" => TParseTypeMsg::GetBannerImgsAdd,
    "get_content_imgs" => TParseTypeMsg::GetContentImgs,
    "get_content_imgs.add" => TParseTypeMsg::GetContentImgs,
    "get_choice" => TParseTypeMsg::GetChoice,
    "get_choice.add" => TParseTypeMsg::GetChoice,
    "amazon_product_brand.add" => TParseTypeMsg::AmazonProductBrandAdd,
    "amazon_product_collections.add" => TParseTypeMsg::AmazonProductCollectionsAdd,

    "shopify_product_id" => TParseTypeMsg::ShopifyProductId,
    "get_price.no_price" => TParseTypeMsg::GetPriceNoPrice,
    "get_content_json.error" => TParseTypeMsg::GetContentJsonError,
};
