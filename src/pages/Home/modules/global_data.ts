import { IConfig } from './types/index.type';

/** 已写入的键缓存，用于一次性写入校验 */
const cache: string[] = [];

/** 全局配置基础数据结构 */
const base = {
    CURRENT_STORE: {
        name: '',
        config: {
            access_token: '',
            api_version: '',
            store_domain: '',
            shopify_store_url: '',
            shopify_domain: '',
            amazon_domain: '',
            amazon_collection_urls: [],
        },
    } as IConfig,
    s: 2,
};

/**
 * 全局配置数据（一次性写入 Proxy）。
 *
 * 通过 Proxy 拦截 `set` 操作，实现「每个键只能写入一次」的约束。
 * 第二次写入同一键时抛出 `Error('只能初始化一次')`。
 *
 * 用途：存储应用启动时从 Tauri Store 加载的店铺配置（`CURRENT_STORE`），
 * 确保配置在运行期间不会被意外覆盖。
 *
 * @example
 * ```ts
 * GLOBAL_DATA.CURRENT_STORE = loadedConfig; // 首次写入成功
 * GLOBAL_DATA.CURRENT_STORE = otherConfig;  // 抛出 Error('只能初始化一次')
 * ```
 */
export const GLOBAL_DATA = new Proxy<typeof base>(base, {
    set(target, key: keyof typeof base, value: typeof base[keyof typeof base]) {
        if (cache.includes(key)) {
            throw new Error('只能初始化一次');
        }
        cache.push(key);
        target[key as 'CURRENT_STORE'] = value as IConfig;
        return true;
    },
    get(target, p: keyof typeof base) {
        return target[p];
    },
});
