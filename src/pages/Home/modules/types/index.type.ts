
/**
 * SKU 数据采集结果 —— 包含列表和映射两种访问方式。
 * - `sku_data` —— SKU 列表，用于遍历
 * - `sku_map` —— SKU → 数据映射，用于快速查找
 */
type TThenData = {sku_data: IAmazonData[], sku_map: Record<string, IAmazonData>};

/**
 * 所有可解析字段的联合类型。
 *
 * 涵盖 Amazon 产品页面的各个数据维度（标题、价格、图片、描述等）
 * 以及 Shopify 端的关联字段（product_id、sku_id、inventory 等）。
 */
type TParseType =
    'shopify_product_id' |
    'shopify_sku_id' |
    'shopify_inventory' |
    'shopify_inventory_detail' |

    'amazon_product_sku' |
    'amazon_address_url' |
    'amazon_product_brand' |
    'amazon_product_collections' |
    'amazon_first_image' |

    'get_title' |
    'get_desc_text' |
    'get_price' |
    'get_relevance_tag' |
    'get_detail' |
    'get_features_specs' |
    'get_content_json' |
    'get_sku_model' |
    'get_choice' |
    'get_review_data' |

    'get_banner_imgs' |
    'get_content_imgs';
/** 解析字段类型 + 错误子类型（如 `get_price.no_price`、`get_content_json.error`） */
type TParseTypeMsg = TParseType | 'get_price.no_price' | 'get_content_json.error' | 'get_review_data.error';
/** 单个字段的解析结果数据包装 */
type TParseData = IHtmlParseData<IOtherData | string | string[] | null | number | undefined | boolean>;

// ~~~~~~~~~~~~~~~~~~~~~~

/**
 * Shopify 产品数据 —— 继承自 IAmazonData，额外包含 Shopify 特有字段。
 * 用于比对引擎中与 Amazon 数据进行结构对齐。
 */
interface IShopifyData extends IAmazonData {
    // sku: string;
    /** Shopify 变体 ID（用于价格更新等操作） */
    variant_id?: string;
    // detail?: TParseData[];
    // detail_map?: Record<TParseType, TParseData>;
}

/**
 * Shopify 产品原始数据 —— 从 Shopify 产品页面 HTML 中解析出的完整数据结构。
 * 对应 `#product-info-data` JSON 节点的数据格式。
 */
interface IShopifyProductData {
    title: string;
    price: string;
    sku: string;
    desc_text: string;
    inventory: string;
    banner_imgs: string[];
    recommend: boolean;
    amazon_address_url?: string | null;
    detail?: string | null;
    sku_model?: string | null;
    features_specs?: string | null;
    content_imgs?: string[] | null;
    content_json?: string | null;
    review_data_json?: string | null;
    shopify_product_id: number,
    shopify_sku_id?: number,
    relevance_tag?: string,
}

// ~~~~~~~~~~~~~~~~~~~~~~

/**
 * Amazon 产品数据 —— 以 SKU 为主键的产品信息。
 * - `detail` —— 解析后的字段数组，用于遍历
 * - `detail_map` —— 字段类型 → 解析数据的映射，用于快速查找
 * - `site` —— 站点代码（如 'us'、'ca'），标识数据来源站点
 */
interface IAmazonData {
    sku: string;
    site?: string;
    detail?: TParseData[];
    detail_map?: Record<TParseType, TParseData>;
}

/**
 * HTML 解析数据包装类 —— 统一所有字段解析结果的结构。
 *
 * 每个产品字段（标题、价格、图片等）的解析结果都包装为此类实例，
 * 包含：字段类型（type）、解析数据（data）、错误信息（msg/error）。
 * 比对引擎通过此类的结构统一处理所有字段的对比逻辑。
 *
 * @typeParam T - 解析数据的具体类型
 */
export class IHtmlParseData<T> {
    data: T;
    msg?: string;
    error?: unknown;
    type: TParseType;

    constructor(type: TParseType, data: T);
    constructor(type: TParseType, data: T, msg: string);
    constructor(type: TParseType, data: T, error: Error);
    constructor(type: TParseType, data: T, msg: string, error: unknown);
    constructor(type: TParseType, data: T, msg_or_error?: unknown, error?: unknown) {
        this.type = type;
        this.data = data;
        this.error = error;
        if (typeof msg_or_error === 'string') {
            this.msg = msg_or_error;
        }
        else {
            this.error = msg_or_error;
        }
    }
}

interface IDetailContentRoot {
    layout: 'style2';
    config: IDetailContentData[];
}

interface IDetailContentData {
    type: 'img' | 'title' | 'text' | 'row' | 'columns';
    alt?: string;
    value?: string | IDetailContentData[];
    style?: string;
}

interface IOtherData {
    price?: number;
    old_price?: number;
    html?: string;
    text?: string;
    inventory_total?: number | string;
    inventory_us?: number | string;
    inventory_ca?: number | string;
}

/** Amazon 站点域名映射项 */
interface IAmazonDomainItem {
    /** 站点代码，如 'us'、'ca' */
    site: string;
    /** 站点域名，如 'https://www.amazon.com' */
    domain: string;
}

interface IConfig {
    name: string;
    config: {
        access_token: string,
        api_version: string,
        store_domain: string,

        shopify_store_url: string,
        shopify_domain: string,

        amazon_domains: IAmazonDomainItem[],
        amazon_collection_urls: string[],
    };
}

interface IReviewData {
    /** 名称 */
    name: string;
    /** 评价星数 */
    review: number;
    /** 评价文案 */
    text: string;
    /** 评价时间 */
    date: string;
    /** 产品类型 */
    model: string;
    /** 头像 */
    avatar: string;
}

export type {
    IDetailContentRoot,
    IDetailContentData,
    IAmazonData,
    TThenData,
    IShopifyData,
    IShopifyProductData,
    TParseType,
    TParseData,
    IOtherData,
    TParseTypeMsg,
    IConfig,
    IAmazonDomainItem,
    IReviewData
};
