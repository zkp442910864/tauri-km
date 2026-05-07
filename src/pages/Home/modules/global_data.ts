import { IConfig } from './types/index.type';
import { store } from './store';

/** 已写入的键缓存，用于一次性写入校验 */
const cache: string[] = [];

/** 默认空配置 */
const default_config: IConfig = {
    name: 'chonchow',
    config: {
        access_token: '',
        api_version: '',
        store_domain: '',
        shopify_store_url: '',
        shopify_domain: '',
        amazon_domains: [],
        amazon_collection_urls: [],
    },
};

/** 全局配置基础数据结构 */
const base = {
    CURRENT_STORE: default_config,
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

/**
 * 更新当前店铺配置 —— 同步更新 GLOBAL_DATA 和 Tauri Store。
 *
 * 用于配置弹窗保存时调用，会同时：
 * 1. 更新内存中的 `GLOBAL_DATA.CURRENT_STORE`
 * 2. 更新 Tauri Store 中的 `configs` 数组（按 name 匹配替换）
 *
 * @param new_config - 新的配置对象（完整的 IConfig）
 *
 * @example
 * ```ts
 * await update_current_config({
 *   name: 'chonchow',
 *   config: { access_token: 'xxx', ... },
 * });
 * ```
 */
export const update_current_config = async (new_config: IConfig) => {
    // 更新内存中的配置 —— 使用 Object.assign 保持引用不变，
    // 确保 ShopifyAdminApi 等持有旧引用的单例也能看到最新值
    base.CURRENT_STORE.name = new_config.name;
    Object.assign(base.CURRENT_STORE.config, new_config.config);

    // 同步更新 Tauri Store 中的 configs 数组
    const configs = await store.get_val<IConfig[]>('configs') ?? [];
    const index = configs.findIndex(ii => ii.name === new_config.name);
    if (index >= 0) {
        configs[index] = new_config;
    }
    else {
        configs.push(new_config);
    }
    await store.set_val('configs', configs);
};
