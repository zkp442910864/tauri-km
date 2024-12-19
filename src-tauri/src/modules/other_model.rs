
use phf::phf_map;
use serde::{Deserialize, Serialize};

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

// 定义枚举，用于描述每种类型
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
    GetSkuModel,
    ShopifyProductId,
    GetContentImgs,
    GetPriceNoPrice,
    GetContentJsonError,
    GetRelevanceTag,
}

// 使用 `phf` 静态哈希映射来关联字符串和枚举值
pub static PARSE_TYPE_MAP: phf::Map<&'static str, TParseTypeMsg> = phf_map! {
    "get_title" => TParseTypeMsg::GetTitle,
    "amazon_address_url" => TParseTypeMsg::AmazonAddressUrl,
    "get_banner_imgs" => TParseTypeMsg::GetBannerImgs,
    "get_price" => TParseTypeMsg::GetPrice,
    "get_detail" => TParseTypeMsg::GetDetail,
    "get_desc_text" => TParseTypeMsg::GetDescText,
    "get_features_specs" => TParseTypeMsg::GetFeaturesSpecs,
    "get_content_json" => TParseTypeMsg::GetContentJson,
    "get_sku_model" => TParseTypeMsg::GetSkuModel,
    "shopify_product_id" => TParseTypeMsg::ShopifyProductId,
    "get_content_imgs" => TParseTypeMsg::GetContentImgs,
    "get_price.no_price" => TParseTypeMsg::GetPriceNoPrice,
    "get_content_json.error" => TParseTypeMsg::GetContentJsonError,
    "get_relevance_tag" => TParseTypeMsg::GetRelevanceTag,
};