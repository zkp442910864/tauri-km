
type TThenData = {sku_data: IAmazonData[], sku_map: Record<string, IAmazonData>};
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
type TParseTypeMsg = TParseType | 'get_price.no_price' | 'get_content_json.error' | 'get_review_data.error';
type TParseData = IHtmlParseData<IOtherData | string | string[] | null | number | undefined | boolean>;

// ~~~~~~~~~~~~~~~~~~~~~~

interface IShopifyData extends IAmazonData {
    // sku: string;
    variant_id?: string;
    // detail?: TParseData[];
    // detail_map?: Record<TParseType, TParseData>;
}

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

interface IAmazonData {
    sku: string;
    detail?: TParseData[];
    detail_map?: Record<TParseType, TParseData>;
}

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

interface IConfig {
    name: string;
    config: {
        access_token: string,
        api_version: string,
        store_domain: string,

        shopify_store_url: string,
        shopify_domain: string,

        amazon_domain: string,
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
    IReviewData
};