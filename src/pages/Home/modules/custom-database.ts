import dayjs from 'dayjs';
import type { IAmazonData, IOtherData, TParseData } from './types/index.type';
import Database from '@tauri-apps/plugin-sql';
import { LogOrErrorSet } from '@/utils';

export class CustomDatabase {
    static instance: CustomDatabase;
    static DB_NAME = 'shopify_data.db';
    db: Database;
    shopify_product_table_name = 'product';

    static async init() {
        const db = await Database.load(`sqlite:${CustomDatabase.DB_NAME}`);
        const obj = CustomDatabase.instance = new CustomDatabase(db);
        await obj.create_product_table();
        // await obj.db.close();
    }

    static get_instance() {
        if (!CustomDatabase.instance) {
            CustomDatabase.instance = new CustomDatabase();
        }
        return CustomDatabase.instance;
    }

    constructor(db?: Database) {
        if (!db) {
            throw new Error('请先执行init');
        }
        this.db = db;
    }

    create_product_table() {
        return this.db.execute(`
            CREATE TABLE IF NOT EXISTS ${this.shopify_product_table_name} (
                sku                TEXT    PRIMARY KEY ON CONFLICT ROLLBACK
                                        NOT NULL,
                title              TEXT,
                price              NUMERIC,
                inventory          NUMERIC,
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
        const table_keys = ['sku', 'title', 'price', 'inventory', 'model', 'shopify_product_id', 'create_date', 'update_date',];
        const placeholders = table_keys.map((_, index) => `$${index + 1}`);
        const map = item.detail_map!;

        return this.db.execute(
            `insert into ${this.shopify_product_table_name} (${table_keys.join(', ')}) values (${placeholders.join(', ')})`,
            [
                item.sku, map.get_title.data, (map.get_price.data as IOtherData).price, map.shopify_inventory.data, map.get_sku_model.data, map.shopify_product_id.data,
                dayjs().format('YYYY-MM-DD HH:mm:ss'), dayjs().format('YYYY-MM-DD HH:mm:ss'),
            ]
        ).catch(err => {
            LogOrErrorSet.get_instance().push_log(`数据插入失败: sku:${item.sku} \n ${LogOrErrorSet.get_instance().save_error(err)}`, { error: true, is_fill_row: true, });
        });
    }

    product_update_data(item: IAmazonData) {
        const table_keys = ['title', 'price', 'inventory', 'model', 'update_date',];
        const map = item.detail_map!;

        return this.db.execute(
            `update ${this.shopify_product_table_name} set ${table_keys.map((key, index) => `${key}=$${index + 1}`).join(', ')} where sku="${item.sku}"`,
            [
                map.get_title.data, (map.get_price.data as IOtherData).price, map.shopify_inventory.data, map.get_sku_model.data, dayjs().format('YYYY-MM-DD HH:mm:ss'),
            ]
        ).catch(err => {
            LogOrErrorSet.get_instance().push_log(`数据更新失败: sku:${item.sku} \n ${LogOrErrorSet.get_instance().save_error(err)}`, { error: true, is_fill_row: true, });
        });
    }

}
