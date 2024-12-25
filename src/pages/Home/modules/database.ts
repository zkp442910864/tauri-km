import dayjs from 'dayjs';
import type { IAmazonData, IOtherData, TParseData } from './types/index.type';
import { default as TauriDatabase } from '@tauri-apps/plugin-sql';
import { LogOrErrorSet } from '@/utils';

export class Database {
    static instance: Database;
    static DB_NAME = 'shopify_data.db';
    db: TauriDatabase;
    private shopify_product_table_name = 'product';

    static async init() {
        const db = await TauriDatabase.load(`sqlite:${Database.DB_NAME}`);
        const obj = Database.instance = new Database(db);
        await obj.create_product_table();
    }

    static get_instance() {
        return Database.instance;
    }

    private constructor(db?: TauriDatabase) {
        if (!db) {
            throw new Error('请先执行init');
        }
        this.db = db;
    }

    async reset_db() {
        await this.db.execute(`drop table if exists ${this.shopify_product_table_name}`);
        await this.create_product_table();
    }

    private create_product_table() {
        return this.db.execute(`
            CREATE TABLE IF NOT EXISTS ${this.shopify_product_table_name} (
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

    async product_push_data(data: IAmazonData[]) {

        for (const item of data) {
            const result = await this.db.select(`select sku from ${this.shopify_product_table_name} where sku=$1`, [item.sku,]).catch(err => {
                LogOrErrorSet.get_instance().push_log(`查询失败: sku:${item.sku} \n ${LogOrErrorSet.get_instance().save_error(err)}`, { error: true, is_fill_row: true, });
                return [];
            });
            // console.log(result);
            // await this.product_insert_data(item);
            // console.log(result);
            if ((result as []).length) {
                await this.product_update_data(item);
            }
            else {
                await this.product_insert_data(item);
            }


        }
    }

    product_insert_data(item: IAmazonData) {
        const table_keys = ['sku', 'title', 'price', 'inventory_total', 'inventory_us', 'inventory_ca', 'model', 'shopify_product_id', 'create_date', 'update_date',];
        const placeholders = table_keys.map((_, index) => `$${index + 1}`);
        const map = item.detail_map!;

        return LogOrErrorSet.get_instance().capture_error(() => {
            return this.db.execute(
                `insert into ${this.shopify_product_table_name} (${table_keys.join(', ')}) values (${placeholders.join(', ')})`,
                [
                    item.sku, map.get_title.data, (map.get_price.data as IOtherData).price,
                    (map.shopify_inventory_detail.data as IOtherData).inventory_total, (map.shopify_inventory_detail.data as IOtherData).inventory_us, (map.shopify_inventory_detail.data as IOtherData).inventory_ca,
                    map.get_sku_model.data, map.shopify_product_id.data,
                    dayjs().format('YYYY-MM-DD HH:mm:ss'), dayjs().format('YYYY-MM-DD HH:mm:ss'),
                ]
            );
        }, item);
    }

    product_update_data(item: IAmazonData) {
        const table_keys = ['title', 'price', 'inventory_total', 'inventory_us', 'inventory_ca', 'model', 'update_date',];
        const map = item.detail_map!;

        return LogOrErrorSet.get_instance().capture_error(() => {
            return this.db.execute(
            `update ${this.shopify_product_table_name} set ${table_keys.map((key, index) => `${key}=$${index + 1}`).join(', ')} where sku="${item.sku}"`,
            [
                map.get_title.data, (map.get_price.data as IOtherData).price,
                (map.shopify_inventory_detail.data as IOtherData).inventory_total, (map.shopify_inventory_detail.data as IOtherData).inventory_us, (map.shopify_inventory_detail.data as IOtherData).inventory_ca,
                map.shopify_inventory.data, map.get_sku_model.data, dayjs().format('YYYY-MM-DD HH:mm:ss'),
            ]
            );
        }, item);
    }

}

export const database = new Proxy({} as Database, {
    get: (_, key) => {
        return Database.get_instance()[key as keyof Database];
    },
});
