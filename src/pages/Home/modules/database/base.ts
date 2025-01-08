/* eslint-disable @typescript-eslint/no-unused-vars */
import { default as TauriDatabase } from '@tauri-apps/plugin-sql';

export const DB_NAME = 'shopify_data.db';
export let db: TauriDatabase;
export const init_database_raw = async () => {
    db = await TauriDatabase.load(`sqlite:${DB_NAME}`);
};

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
