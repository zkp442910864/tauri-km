import { Store as TauriStore } from '@tauri-apps/plugin-store';


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

type TKey = 'configs';

