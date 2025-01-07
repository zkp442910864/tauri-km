import { IConfig } from './types/index.type';

const cache: string[] = [];
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
