import { log_error } from '@/utils';
import { IAmazonData, IOtherData } from '../types/index.type';
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
                sku                TEXT    PRIMARY KEY ON CONFLICT ROLLBACK
                                        NOT NULL,
                title              TEXT,
                price              NUMERIC,
                inventory_total          NUMERIC,
                inventory_us          NUMERIC,
                inventory_ca          NUMERIC,
                model              TEXT,
                shopify_product_id TEXT,
                status             NUMERIC NOT NULL
                                        DEFAULT (1),
                create_date        TEXT,
                update_date        TEXT
            );
        `);
    }

    async update_data(item: IAmazonData) {
        const table_keys = [
            'title', 'price',
            'inventory_total', 'inventory_us', 'inventory_ca',
            'model',
            'update_date',
        ];
        const map = item.detail_map!;

        await log_error.capture_error(() => {
            return db.execute(
                `update ${this.table_name} set ${table_keys.map((key, index) => `${key}=$${index + 1}`).join(', ')} where sku="${item.sku}"`,
                [
                    map.get_title.data, (map.get_price.data as IOtherData).price,
                    (map.shopify_inventory_detail.data as IOtherData).inventory_total, (map.shopify_inventory_detail.data as IOtherData).inventory_us, (map.shopify_inventory_detail.data as IOtherData).inventory_ca,
                    map.get_sku_model.data,
                    dayjs().format('YYYY-MM-DD HH:mm:ss'),
                ]
            );
        }, item);
    }

    async insert_data(item: IAmazonData) {
        const table_keys = [
            'sku', 'title', 'price',
            'inventory_total', 'inventory_us', 'inventory_ca',
            'model', 'shopify_product_id',
            'create_date', 'update_date',
        ];
        const placeholders = table_keys.map((_, index) => `$${index + 1}`);
        const map = item.detail_map!;

        await log_error.capture_error(() => {
            return db.execute(
                `insert into ${this.table_name} (${table_keys.join(', ')}) values (${placeholders.join(', ')})`,
                [
                    item.sku, map.get_title.data, (map.get_price.data as IOtherData).price,
                    (map.shopify_inventory_detail.data as IOtherData).inventory_total, (map.shopify_inventory_detail.data as IOtherData).inventory_us, (map.shopify_inventory_detail.data as IOtherData).inventory_ca,
                    map.get_sku_model.data, map.shopify_product_id.data,
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

            log_error.push_log('shopify 产品入库成功');
        });
    }
}
