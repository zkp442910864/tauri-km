/* eslint-disable @typescript-eslint/no-unused-vars */
import { default as TauriDatabase } from '@tauri-apps/plugin-sql';

/** SQLite 数据库文件名 */
export const DB_NAME = 'shopify_data.db';
/** 全局数据库连接实例（由 `init_database_raw` 初始化） */
export let db: TauriDatabase;

/**
 * 初始化 SQLite 数据库连接。
 * 必须在任何数据库操作之前调用，加载 `shopify_data.db` 文件。
 */
export const init_database_raw = async () => {
    db = await TauriDatabase.load(`sqlite:${DB_NAME}`);
};

/**
 * 数据库操作抽象基类。
 *
 * 为 `AmazonProduct` 和 `ShopifyProduct` 提供统一的数据库操作接口：
 * - `create_table` —— 建表（子类实现具体 SQL）
 * - `insert_data` —— 插入单条数据
 * - `update_data` —— 更新单条数据
 * - `push_data` —— 批量插入/更新
 * - `get_data` —— 查询数据
 * - `reset_table` —— 删除并重建表
 *
 * @typeParam T - 表记录的数据类型
 */
export abstract class CDatabase<T = never> {
    table_name = '';
    constructor() {}

    // async init() {
    //     await this.create_table();
    // }

    async create_table(): Promise<void> {
        // Implementation goes here
        return Promise.resolve();
    }

    async insert_data(data: T): Promise<void> {
        // Implementation goes here
        return Promise.resolve();
    }

    async update_data(data: T): Promise<void> {
        // Implementation goes here
        return Promise.resolve();
    }

    async push_data(data: T[]): Promise<void> {
        // Implementation goes here
        return Promise.resolve();
    }

    async get_data(where?: string): Promise<unknown> {
        // Implementation goes here
        return Promise.resolve();
    }

    async reset_table() {
        await db.execute(`drop table if exists ${this.table_name}`);
        await this.create_table();
    }
}
