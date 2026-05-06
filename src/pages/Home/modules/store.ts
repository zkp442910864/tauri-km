import { Store as TauriStore } from '@tauri-apps/plugin-store';

/**
 * Tauri 持久化 KV 存储封装（单例）。
 *
 * 基于 `@tauri-apps/plugin-store` 实现，数据存储在本地文件 `web_cache_data` 中。
 * 通过 Proxy 代理实现 `store.key` 的便捷访问语法。
 *
 * @example
 * ```ts
 * await store_init(); // 应用启动时初始化
 * await store.set_val('configs', { ... }); // 写入
 * const config = await store.get_val<IConfig>('configs'); // 读取
 * ```
 */
class Store {
    private static instance: Store;
    private store: TauriStore;

    static init = async () => {
        const store = await TauriStore.load('web_cache_data');
        Store.instance = new Store(store);
    };

    static get_instance() {
        return Store.instance;
    }

    private constructor(store: TauriStore) {
        this.store = store;
    }

    async set_val(key: TKey, value: unknown) {
        await this.store.set(key, value);
        await this.store.save();
    }

    async get_val<T = unknown>(key: TKey) {
        return await this.store.get(key) as T | null;
    }
}

export const store_init = Store.init;
export const store = new Proxy({} as Store, {
    get: (_, key) => {
        return Store.get_instance()[key as keyof Store];
    },
});

/** 存储键名类型 —— 限制只能使用预定义的键 */
type TKey = 'configs';

