import { log_error } from '@/utils';
import { IAmazonData, IOtherData } from '../types/index.type';
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
                                        NOT NULL,
                title              TEXT,
                url        TEXT,
                first_image        TEXT,
                choice      NUMERIC NOT NULL
                                        DEFAULT (0),
                model              TEXT,
                status             NUMERIC NOT NULL
                                        DEFAULT (1),
                create_date        TEXT,
                update_date        TEXT
            );
        `);
    }

    async update_data(item: IAmazonData) {
        const table_keys = [
            'title', 'url', 'first_image',
            'choice', 'model',
            'update_date',
        ];
        const map = item.detail_map!;

        await log_error.capture_error(() => {
            return db.execute(
                `update ${this.table_name} set ${table_keys.map((key, index) => `${key}=$${index + 1}`).join(', ')} where sku="${item.sku}"`,
                [
                    map.get_title.data, map.amazon_address_url.data, map.amazon_first_image.data,
                    +(map.amazon_choice.data as number), map.get_sku_model.data,
                    dayjs().format('YYYY-MM-DD HH:mm:ss'),
                ]
            );
        }, item);
    }

    async insert_data(item: IAmazonData) {
        const table_keys = [
            'sku', 'title', 'url', 'first_image',
            'choice', 'model',
            'create_date', 'update_date',
        ];
        const placeholders = table_keys.map((_, index) => `$${index + 1}`);
        const map = item.detail_map!;

        await log_error.capture_error(() => {
            return db.execute(
                `insert into ${this.table_name} (${table_keys.join(', ')}) values (${placeholders.join(', ')})`,
                [
                    item.sku, map.get_title.data, map.amazon_address_url.data, map.amazon_first_image.data,
                    +(map.amazon_choice.data as number), map.get_sku_model.data,
                    dayjs().format('YYYY-MM-DD HH:mm:ss'), dayjs().format('YYYY-MM-DD HH:mm:ss'),
                ]
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

    async get_choice_data() {
        return await log_error.capture_error(async () => {
            const keys = ['sku', 'title', 'url', 'first_image', 'model',];
            const result = await db.select(`select ${keys.join()} from ${this.table_name} where choice=1`);
            return result as IChoiceData[];
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
