import { log_error } from '@/utils';
import { IAmazonData, IHtmlParseData, IOtherData, IShopifyData, TParseData, TParseType, TThenData } from '../types/index.type';
import { CDatabase, db } from './base';
import dayjs from 'dayjs';

export class ShopifyProduct extends CDatabase {
    static instance: ShopifyProduct;
    table_name = 'shopify_product';

    static get_instance() {
        ShopifyProduct.instance = ShopifyProduct.instance || new ShopifyProduct();
        return ShopifyProduct.instance;
    }

    async create_table() {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS ${this.table_name} (
                sku                     TEXT    PRIMARY KEY ON CONFLICT ROLLBACK
                                        NOT NULL
                                        COLLATE NOCASE,

                get_title              TEXT,
                get_banner_imgs              TEXT,
                get_price              TEXT,
                get_sku_model              TEXT,
                get_relevance_tag              TEXT,
                get_desc_text              TEXT,
                get_detail              TEXT,
                get_content_imgs              TEXT,
                get_content_json              TEXT,
                amazon_address_url              TEXT,

                shopify_product_id              TEXT,
                shopify_sku_id              TEXT,
                shopify_inventory              TEXT,
                shopify_inventory_detail              TEXT,

                price              NUMERIC,
                inventory_total          NUMERIC,
                inventory_us          NUMERIC,
                inventory_ca          NUMERIC,
                status             NUMERIC NOT NULL
                                        DEFAULT (1),
                create_date        TEXT,
                update_date        TEXT
            );
        `);
    }

    async update_data(item: IAmazonData, update_inventory = false) {
        const table_keys = [
            'get_title',
            'get_banner_imgs',
            'get_price',
            'get_sku_model',
            'get_relevance_tag',
            'get_desc_text',
            'get_detail',
            'get_content_imgs',
            'get_content_json',
            'amazon_address_url',

            'shopify_product_id',
            'shopify_sku_id',

            'price',
            ...update_inventory
                ? [
                    'shopify_inventory',
                    'shopify_inventory_detail',
                    'inventory_total',
                    'inventory_us',
                    'inventory_ca',
                ]
                : [],

            'status',

            'update_date',
        ];

        await log_error.capture_error(() => {
            return db.execute(
                `update ${this.table_name} set ${table_keys.map((key, index) => `${key}=$${index + 1}`).join(', ')} where sku="${item.sku}"`,
                this.match_value(table_keys, item)
            );
        }, item);
    }

    async insert_data(item: IAmazonData) {
        const table_keys = [
            'sku',

            'get_title',
            'get_banner_imgs',
            'get_price',
            'get_sku_model',
            'get_relevance_tag',
            'get_desc_text',
            'get_detail',
            'get_content_imgs',
            'get_content_json',
            'amazon_address_url',

            'shopify_product_id',
            'shopify_sku_id',
            'shopify_inventory',
            'shopify_inventory_detail',

            'price',
            'inventory_total',
            'inventory_us',
            'inventory_ca',
            'status',

            'create_date',
            'update_date',
        ];
        const placeholders = table_keys.map((_, index) => `$${index + 1}`);

        await log_error.capture_error(() => {
            return db.execute(
                `insert into ${this.table_name} (${table_keys.join(', ')}) values (${placeholders.join(', ')})`,
                this.match_value(table_keys, item)
            );
        }, item);
    }

    async push_data(data: IAmazonData[], update_inventory = false) {
        await log_error.capture_error(async () => {
            for (const item of data) {
                const result = await db.select(`select sku from ${this.table_name} where sku=$1`, [item.sku,]);

                if ((result as []).length) {
                    await this.update_data(item, update_inventory);
                }
                else {
                    await this.insert_data(item);
                }
            }

            log_error.push_log('shopify 产品入库成功');
        });
    }

    async get_data(where?: string) {
        const table_keys = [
            'sku',

            'get_title',
            'get_banner_imgs',
            'get_price',
            'get_sku_model',
            'get_relevance_tag',
            'get_desc_text',
            'get_detail',
            'get_content_imgs',
            'get_content_json',
            'amazon_address_url',

            'shopify_product_id',
            'shopify_sku_id',
            'shopify_inventory',
            'shopify_inventory_detail',
        ];
        const result: Record<TParseType | 'sku', string>[] = await db.select(
            `select ${table_keys.join()} from ${this.table_name} where status=1 ${where ? 'and ' + where : ''}`
        );

        const new_result = result.map((raw_item) => {
            const arr: TParseData[] = table_keys.slice(1).map((key) => {
                return new IHtmlParseData(key as TParseType, JSON.parse(raw_item[key as TParseType]) as string);
            });
            const data: IShopifyData = {
                sku: raw_item.sku,
                variant_id: raw_item.shopify_sku_id,
                detail: arr,
                detail_map: Object.fromEntries(arr.map((ii) => [ii.type, ii,])) as Record<TParseType, TParseData>,
            };
            return data;
        });


        return {
            sku_data: new_result,
            sku_map: Object.fromEntries(new_result.map(ii => [ii.sku, ii,])),
        } as TThenData;
    }

    match_value(keys: string[], item: IAmazonData) {
        const map = item.detail_map!;

        return keys.map(key => {
            const detail_data = map[key as TParseType]?.data;
            if (key === 'status') return 1;
            if (key === 'sku') return item.sku;
            if (key === 'price') return (map.get_price.data as IOtherData).price;
            if (key === 'inventory_total') return (map.shopify_inventory_detail?.data as IOtherData)?.inventory_total;
            if (key === 'inventory_us') return (map.shopify_inventory_detail?.data as IOtherData)?.inventory_us;
            if (key === 'inventory_ca') return (map.shopify_inventory_detail?.data as IOtherData)?.inventory_ca;
            if (['create_date', 'update_date',].includes(key)) return dayjs().format('YYYY-MM-DD HH:mm:ss');

            if (typeof detail_data !== 'undefined') {
                return JSON.stringify(detail_data);
            }

            return JSON.stringify('key 匹配不到');
        });
    }
}
