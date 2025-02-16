import { log_error } from '@/utils';
import { IAmazonData, IHtmlParseData, TParseData, TParseType, TThenData } from '../types/index.type';
import { CDatabase, db } from './base';
import dayjs from 'dayjs';

export class AmazonProduct extends CDatabase {
    static instance: AmazonProduct;
    table_name = 'amazon_product';

    static get_instance() {
        AmazonProduct.instance = AmazonProduct.instance || new AmazonProduct();
        return AmazonProduct.instance;
    }

    async create_table() {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS ${this.table_name} (
                sku                TEXT    PRIMARY KEY ON CONFLICT ROLLBACK
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
                get_choice           NUMERIC NOT NULL
                                        DEFAULT (0),
                get_review_data              TEXT,

                amazon_first_image           TEXT,
                amazon_address_url           TEXT,
                amazon_product_sku           TEXT,
                amazon_product_brand           TEXT,
                amazon_product_collections           TEXT,

                status             NUMERIC NOT NULL
                                        DEFAULT (1),
                create_date        TEXT,
                update_date        TEXT
            );
        `);
    }

    async update_data(item: IAmazonData) {
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
            'get_choice',
            'get_review_data',

            'amazon_first_image',
            'amazon_address_url',
            'amazon_product_sku',
            'amazon_product_brand',
            'amazon_product_collections',

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
            'get_choice',
            'get_review_data',

            'amazon_first_image',
            'amazon_address_url',
            'amazon_product_sku',
            'amazon_product_brand',
            'amazon_product_collections',

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

    async push_data(data: IAmazonData[]) {
        await log_error.capture_error(async () => {

            for (const item of data) {
                const result = await db.select(`select sku from ${this.table_name} where sku=$1`, [item.sku,]);

                if ((result as []).length) {
                    await this.update_data(item);
                }
                else {
                    await this.insert_data(item);
                }
            }

            log_error.push_log('amazon 产品入库成功');
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
            'get_choice',
            'get_review_data',

            'amazon_first_image',
            'amazon_address_url',
            'amazon_product_sku',
            'amazon_product_brand',
            'amazon_product_collections',
        ];
        const result: Record<TParseType | 'sku', string>[] = await db.select(
            `select ${table_keys.join()} from ${this.table_name} where status=1 ${where ? 'and ' + where : ''}`
        );

        const new_result = result.map((raw_item) => {
            const arr: TParseData[] = table_keys.slice(1).map((key) => {
                return new IHtmlParseData(key as TParseType, JSON.parse(raw_item[key as TParseType]) as string);
            });
            const data: IAmazonData = {
                sku: raw_item.sku,
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

    async get_choice_data() {
        return await log_error.capture_error(async () => {
            const keys = ['sku', 'get_title as title', 'amazon_address_url as url', 'amazon_first_image as first_image', 'get_sku_model as model',];
            const result = await db.select(`select ${keys.join()} from ${this.table_name} where amazon_choice=1`);
            return this.handle_display_value(result as []) as IChoiceData[];
        });
    }

    match_value(keys: string[], item: IAmazonData) {
        const map = item.detail_map!;

        return keys.map(key => {
            const detail_data = map[key as TParseType]?.data;

            if (key === 'status') return 1;
            if (key === 'sku') return item.sku;
            // if (key === 'amazon_choice') return +(detail_data || false);
            if (['create_date', 'update_date',].includes(key)) return dayjs().format('YYYY-MM-DD HH:mm:ss');

            if (typeof detail_data !== 'undefined') {
                return JSON.stringify(detail_data);
            }

            return JSON.stringify('key 匹配不到');
        });
    }

    handle_display_value<T extends Record<string, string>[]>(data: T) {
        return data.map((item) => {
            const sku = item.sku;
            delete item.sku;
            return {
                ...Object.fromEntries(Object.keys(item).map(key => [key, JSON.parse(item[key]),])),
                sku,
            };
        });
    }
}

interface IChoiceData {
    sku: string;
    title?: string;
    url?: string;
    first_image?: string;
    model?: string;
}
