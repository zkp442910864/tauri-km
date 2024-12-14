
type TThenData = {sku_data: IAmazonData[], sku_map: Record<string, IAmazonData>};
type TParseType = 'get_title' |
    'amazon_address_url' |
    'get_banner_imgs' |
    'get_price' |
    'get_detail' |
    'get_desc_text' |
    'get_features_specs' |
    'get_content_json' |
    'get_sku_model' |
    'shopify_product_id' |
    'get_content_imgs';
type TParseData = IHtmlParseData<IOtherData | string | string[] | null | number>;

// ~~~~~~~~~~~~~~~~~~~~~~

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IShopifyData extends IAmazonData {
    // sku: string;
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
    amazon_address_url?: string | null;
    detail?: string | null;
    sku_model?: string | null;
    features_specs?: string | null;
    content_imgs?: string[] | null;
    content_json?: string | null;
    shopify_product_id: number,
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
    img_urls: string[];
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
    IOtherData
};