import { invoke } from '@tauri-apps/api/core';
import { store } from '../store';
import { LogOrErrorSet } from '@/utils';
import { GLOBAL_DATA } from '../global_data';

class ShopifyAdminApi {
    static instance: ShopifyAdminApi;

    current_store = GLOBAL_DATA.CURRENT_STORE;

    static init = () => {
        ShopifyAdminApi.instance = new ShopifyAdminApi();
    };

    constructor() {
    }

    async get_data<T>(query: string, variables?: Record<string, unknown>) {
        const res = await invoke<string>('take_graphql_client', {
            json: JSON.stringify({
                query: query,
                variables,
            }),
            accessToken: this.current_store.config.access_token,
            apiVersion: this.current_store.config.api_version,
            storeDomain: this.current_store.config.store_domain,
        });
        const json = JSON.parse(res) as ITauriResponse<T>;
        // console.log(json.data);

        return json.data!;
    }

    /** 获取所有产品 */
    async get_all_product() {
        const all_data: IData[] = [];
        const each = async (last_cursor?: string) => {
            const data = await this.get_data<TShopifyDataModel<'products'>>(gql(`
                query($after: String) {
                    products(first: 100, after: $after, query: "status:active") {
                        edges {
                            node {
                                variants(first: 1) {
                                    nodes {
                                        id
                                        # price
                                        sku
                                    }
                                }
                                id
                                # title
                                handle
                            }
                            cursor
                        }
                        pageInfo { hasNextPage }
                    }
                }
            `), {
                after: last_cursor,
            });


            await LogOrErrorSet.get_instance().capture_error(async () => {
                data.data.products.edges?.forEach(item => {
                    all_data.push(item.node!);
                });
                if (data.data.products.pageInfo.hasNextPage) {
                    await each(data.data.products.edges?.at(-1)?.cursor);
                }
            }, data);
        };

        await each();

        return {
            data: all_data.map((item) => {
                return {
                    product_id: item.id!.replace(/^gid.*?(\d+)$/, '$1'),
                    product_handle: item.handle!,
                    first_variant_id: item.variants!.nodes![0].id!.replace(/^gid.*?(\d+)$/, '$1'),
                    first_variant_sku: item.variants!.nodes![0].sku!,
                };
            }),
        };
    }

    /** 根据变体id获取库存信息 */
    async get_inventory_detail(vid: string) {
        const data = await this.get_data<TShopifyDataModel<'productVariant'>>(gql(`
            query($id: ID!) {
                productVariant(id: $id) {
                    id
                    sku
                    inventoryItem {
                        id
                        sku
                        inventoryLevels(first: 2) {
                            nodes {
                                id
                                quantities(names: ["available"]) {
                                    name
                                    quantity
                                }
                                location {
                                    name
                                }
                            }
                        }
                    }
                    inventoryQuantity
                }
            }
        `), {
            id: this.handle_id(vid, 'ProductVariant'),
        });

        return await LogOrErrorSet.get_instance().capture_error(() => {
            const inventory_levels = data.data.productVariant.inventoryItem?.inventoryLevels?.nodes || [];
            return {
                inventory_quantity: data.data.productVariant.inventoryQuantity,
                data: inventory_levels.map(item => {
                    return {
                        name: item.location?.name,
                        quantity: item.quantities?.[0].quantity,
                    };
                }),
            };
        }, data);
    }

    /** 修改变体指定 自定义数据 */
    async update_variant_assign_metafield(pid: string, vid: string, key: string, value: string) {
        const data = await this.get_data<TShopifyDataModel<'productVariantsBulkUpdate'>>(gql(`
            mutation productVariantsBulkUpdate(
                $pid: ID!,
                $variants: [ProductVariantsBulkInput!]!
            ) {
                productVariantsBulkUpdate(productId: $pid, variants: $variants) {
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            pid: this.handle_id(pid, 'Product'),
            variants: [
                {
                    id: this.handle_id(vid, 'ProductVariant'),
                    metafields: [
                        {
                            namespace: 'custom',
                            key,
                            value,
                        },
                    ],
                },
            ],
            // key,
            // value,
        });

        if (data.data.productVariantsBulkUpdate.userErrors?.length) {
            throw new Error(JSON.stringify(data.data.productVariantsBulkUpdate.userErrors));
        }

    }

    handle_id(val: string, namespace: 'Product' | 'ProductVariant') {
        return val.startsWith('gid://') ? val : `gid://shopify/${namespace}/${val}`;
    }
}

export const init_shopify_admin_api = ShopifyAdminApi.init;
export const shopify_admin_api = new Proxy({} as ShopifyAdminApi, {
    get: (target, property, receiver) => {
        return ShopifyAdminApi.instance[property as keyof ShopifyAdminApi];
    },
});

interface IConfig {
    name: string;
    config: {access_token: string, api_version: string, store_domain: string};
}


type TShopifyDataModel<K extends string, T = TShopifyDataInlineModel & IData> = {
    data: {
        [P in K]: T;
    }
};

type TShopifyDataInlineModel<T = IData> = {
    edges?: Array<{
        cursor?: string,
        node?: T,
    }>,
    nodes?: T[],
    pageInfo: {
        hasNextPage: boolean,
    },
};

/** shopify数据类型,缺失需要手动增加 */
interface IData {
    id?: string;
    inventoryQuantity?: string;
    sku?: string;
    inventoryItem?: IData;
    inventoryLevels?: TShopifyDataInlineModel;
    location?: {
        name: string,
    },
    quantities?: Array<{name?: string, quantity?: number}>,
    variants?: TShopifyDataInlineModel,
    handle?: string
    userErrors?: Array<{field: string[], message: string}>
}

const gql = (s: string) => s;
