import { invoke } from '@tauri-apps/api/core';
import { LogOrErrorSet } from '@/utils';
import { GLOBAL_DATA } from '../global_data';

/**
 * Shopify Admin GraphQL API 封装（单例）。
 *
 * 通过 Tauri `invoke` 调用 Rust 端的 `take_graphql_client` 命令发送 GraphQL 请求。
 * 自动注入当前店铺的 access_token、api_version、store_domain 配置。
 *
 * 主要方法：
 * - `get_data<T>` —— 通用 GraphQL 查询
 * - `get_all_product` —— 分页获取所有活跃产品（SKU + variant ID）
 * - `get_inventory_detail` —— 根据变体 ID 获取库存信息
 *
 * @example
 * ```ts
 * const api = shopify_admin_api;
 * const { data } = await api.get_all_product();
 * ```
 */
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

    /**
     * 更新变体的选项值（如 model、color 等）。
     *
     * 通过 `productVariantsBulkUpdate` mutation 的 `optionValues` 字段
     * 更新指定变体的选项值。
     *
     * @param product_id - 产品 ID
     * @param variant_id - 变体 ID
     * @param option_values - 要更新的选项值数组，每项包含 optionId（GID）和新的 name
     */
    async update_variant_option(
        product_id: string,
        variant_id: string,
        option_values: Array<{ optionId: string; name: string }>
    ): Promise<void> {
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
            pid: this.handle_id(product_id, 'Product'),
            variants: [
                {
                    id: this.handle_id(variant_id, 'ProductVariant'),
                    optionValues: option_values.map(ov => ({
                        optionId: ov.optionId,
                        name: ov.name,
                    })),
                },
            ],
        });

        if (data.data.productVariantsBulkUpdate.userErrors?.length) {
            throw new Error(`update_variant_option 失败: ${JSON.stringify(data.data.productVariantsBulkUpdate.userErrors)}`);
        }
    }

    /**
     * 为产品创建新选项（如 model、color 等）。
     *
     * 使用 Shopify `productOptionsCreate` mutation 创建新选项，
     * 并可通过 `optionValues` 同时设置该选项的值。
     *
     * @param product_id - 产品 ID
     * @param name - 选项名称（如 'model'）
     * @param values - 选项值列表
     * @returns 创建成功后的选项 ID（GID）
     */
    async create_product_option(
        product_id: string,
        name: string,
        values: string[]
    ): Promise<string> {
        const data = await this.get_data<{
            data: {
                productOptionsCreate: {
                    product?: {
                        id?: string;
                        options?: Array<{ id?: string; name?: string; values?: string[] }>;
                    };
                    userErrors?: Array<{ field: string[]; message: string }>;
                };
            }
        }>(gql(`
            mutation productOptionsCreate($productId: ID!, $options: [OptionCreateInput!]!) {
                productOptionsCreate(productId: $productId, options: $options) {
                    product {
                        id
                        options {
                            id
                            name
                            values
                        }
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            productId: this.handle_id(product_id, 'Product'),
            options: [
                {
                    name,
                    values: values.map(v => ({ name: v, })),
                },
            ],
        });

        const result = data.data.productOptionsCreate;
        if (result.userErrors?.length) {
            throw new Error(`productOptionsCreate 失败: ${JSON.stringify(result.userErrors)}`);
        }

        // 返回新创建的选项 ID
        const option = result.product?.options?.find(o => o.name?.toLowerCase() === name.toLowerCase());
        if (!option?.id) {
            throw new Error(`productOptionsCreate 未返回选项 ${name} 的 ID`);
        }

        return option.id;
    }

    /**
     * 批量设置产品级自定义 metafield（已存在则更新，不存在则创建）。
     *
     * 使用 Shopify `metafieldsSet` mutation，将所有 metafield 统一设置到
     * `custom` 命名空间下。
     *
     * @param product_id - 产品 ID
     * @param metafields - 要设置的 metafield 数组，每项包含 key、value 和可选的 type
     */
    async set_product_metafields_v2(
        product_id: string,
        metafields: Array<{ key: string; value: string; type?: string }>
    ): Promise<void> {
        const product_gid = this.handle_id(product_id, 'Product');
        const data = await this.get_data<TShopifyDataModel<'metafieldsSet'>>(gql(`
            mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    metafields {
                        key
                        namespace
                        value
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            metafields: metafields.map(mf => ({
                ownerId: product_gid,
                namespace: 'custom',
                key: mf.key,
                value: mf.value,
                type: mf.type ?? 'single_line_text_field',
            })),
        });

        // console.log('data.data.metafieldsSet', data);
        // debugger;
        if (data.data.metafieldsSet.userErrors?.length) {
            throw new Error(`set_product_metafields 失败: ${JSON.stringify(data.data.metafieldsSet.userErrors)}`);
        }
    }


    /**
     * 清空产品指定 key 的 metafield（删除 value 为空的 metafield）。
     *
     * Shopify GraphQL API 的 `metafieldsSet` 不允许 value 为空字符串。
     * 通过 `metafieldsDelete` mutation 按 ownerId + namespace + key 批量删除。
     * 该 mutation 不需要先查询 metafield ID，直接通过组合键删除。
     *
     * @param product_id - 产品 ID
     * @param keys - 要清空的 metafield key 列表
     */
    async clear_product_metafields(product_id: string, keys: string[]): Promise<void> {
        if (!keys.length) return;

        const product_gid = this.handle_id(product_id, 'Product');

        const delete_data = await this.get_data<{
            data: { metafieldsDelete: { deletedMetafields: Array<{ key: string; namespace: string; ownerId: string } | null>; userErrors: Array<{ field: string[]; message: string }> } }
        }>(gql(`
            mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
                metafieldsDelete(metafields: $metafields) {
                    deletedMetafields {
                        key
                        namespace
                        ownerId
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            metafields: keys.map(key => ({
                ownerId: product_gid,
                namespace: 'custom',
                key,
            })),
        });

        if (delete_data.data.metafieldsDelete.userErrors?.length) {
            throw new Error(`metafieldsDelete 失败: ${JSON.stringify(delete_data.data.metafieldsDelete.userErrors)}`);
        }
    }

    handle_id(val: string, namespace: 'Product' | 'ProductVariant' | 'InventoryItem' | 'Location' | 'Publication') {
        return val.startsWith('gid://') ? val : `gid://shopify/${namespace}/${val}`;
    }

    /**
     * 构建按 SKU 查询产品的 GraphQL 查询（内部复用）。
     *
     * @param sku - 产品 SKU
     * @param status_filter - 状态过滤条件（如 `status:active`），为空则不限状态
     * @returns GraphQL 查询结果
     */
    private async query_product_by_sku(
        sku: string,
        status_filter: string = ''
    ): Promise<ShopifyProductBySku | null> {
        const query_str = status_filter ? `sku:${sku} ${status_filter}` : `sku:${sku}`;
        const data = await this.get_data<TShopifyDataModel<'products'>>(gql(`
            query($query: String!) {
                products(first: 1, query: $query) {
                    edges {
                        node {
                            id
                            title
                            handle
                            status
                            descriptionHtml
                            tags
                            metafields(first: 50, namespace: "custom") {
                                nodes {
                                    key
                                    value
                                    namespace
                                    type
                                }
                            }
                            variants(first: 100) {
                                nodes {
                                    id
                                    sku
                                    title
                                    price
                                    compareAtPrice
                                    selectedOptions {
                                        name
                                        value
                                    }
                                    inventoryItem {
                                        id
                                    }
                                    metafields(first: 50, namespace: "custom") {
                                        nodes {
                                            key
                                            value
                                            namespace
                                            type
                                        }
                                    }
                                }
                            }
                            options {
                                id
                                name
                                values
                                position
                            }
                            images(first: 10) {
                                nodes {
                                    url
                                    altText
                                }
                            }
                        }
                    }
                }
            }
        `), {
            query: query_str,
        });

        const edge = data.data.products.edges?.[0];
        if (!edge?.node) return null;

        const product = edge.node;
        const variant = product.variants?.nodes?.[0];
        if (!variant) return null;

        const product_metafields = (product.metafields?.nodes ?? []).map(mf => ({
            key: mf.key ?? '',
            value: mf.value ?? '',
            namespace: mf.namespace ?? '',
            type: mf.type ?? '',
        }));
        const variant_metafields = (variant.metafields?.nodes ?? []).map(mf => ({
            key: mf.key ?? '',
            value: mf.value ?? '',
            namespace: mf.namespace ?? '',
            type: mf.type ?? '',
        }));

        const variants = (product.variants?.nodes ?? []).map(v => ({
            variant_id: v.id!.replace(/^gid.*?(\d+)$/, '$1'),
            variant_gid: v.id!,
            sku: v.sku ?? '',
            title: v.title ?? '',
            price: v.price ?? '',
            compare_at_price: v.compareAtPrice ?? '',
            selected_options: (v.selectedOptions ?? []).map(opt => ({
                name: opt.name ?? '',
                value: opt.value ?? '',
            })),
            inventory_item_id: v.inventoryItem?.id?.replace(/^gid.*?(\d+)$/, '$1') ?? '',
            inventory_item_gid: v.inventoryItem?.id ?? '',
            metafields: (v.metafields?.nodes ?? []).map(mf => ({
                key: mf.key ?? '',
                value: mf.value ?? '',
                namespace: mf.namespace ?? '',
                type: mf.type ?? '',
            })),
        }));

        const product_options = (product.options ?? []).map(opt => ({
            id: opt.id ?? '',
            name: opt.name ?? '',
            values: opt.values ?? [],
            position: opt.position ?? 0,
        }));

        return {
            product_id: product.id!.replace(/^gid.*?(\d+)$/, '$1'),
            product_gid: product.id!,
            title: product.title ?? '',
            handle: product.handle ?? '',
            status: product.status ?? 'ACTIVE',
            description_html: product.descriptionHtml ?? '',
            tags: product.tags ?? [],
            variant_id: variant.id!.replace(/^gid.*?(\d+)$/, '$1'),
            variant_gid: variant.id!,
            sku: variant.sku ?? '',
            price: variant.price ?? '',
            compare_at_price: variant.compareAtPrice ?? '',
            inventory_item_id: variant.inventoryItem?.id?.replace(/^gid.*?(\d+)$/, '$1') ?? '',
            inventory_item_gid: variant.inventoryItem?.id ?? '',
            product_metafields,
            variant_metafields,
            metafields: [...product_metafields, ...variant_metafields,],
            images: (product.images?.nodes ?? []).map(img => ({
                url: img.url ?? '',
                alt_text: img.altText ?? '',
            })),
            variants,
            product_options,
        };
    }

    /**
     * 按 SKU 查询 Shopify 产品（含所有状态）。
     *
     * 与 `get_product_by_sku` 不同，此方法不限制产品状态，
     * 可查询到 ARCHIVED 等非活跃产品。用于检测归档产品是否需要重新激活。
     *
     * @param sku - 要查询的产品 SKU
     * @returns 产品详情对象或 null（未找到时）
     */
    async get_product_by_sku_any_status(sku: string): Promise<ShopifyProductBySku | null> {
        return this.query_product_by_sku(sku, '');
    }

    /**
     * 按 SKU 查询 Shopify 产品（仅活跃产品）。
     *
     * 通过 GraphQL 查询 `status:active` 的产品，匹配第一个变体的 SKU。
     * 返回产品详情（product_id、variant_id、title、price 等）或 null。
     *
     * @param sku - 要查询的产品 SKU
     * @returns 产品详情对象或 null（未找到时）
     */
    async get_product_by_sku(sku: string): Promise<ShopifyProductBySku | null> {
        return this.query_product_by_sku(sku, 'status:active');
    }

    /**
     * 创建 Shopify 产品（分两步：创建产品 → 更新默认变体 → 可选添加图片）。
     *
     * Shopify 新版 GraphQL API 的 `ProductInput` 不再支持 `variants` 和 `images` 字段，
     * 需要拆分为多个独立 mutation 操作。
     *
     * 注意：`productCreate` 会自动创建一个默认变体（标题为 "Default Title"），
     * 因此需要先获取该默认变体 ID，再通过 `productVariantsBulkUpdate` 更新其属性，
     * 而非使用 `productVariantsBulkCreate` 新建变体（否则会报 "Default Title already exists" 错误）。
     *
     * 流程：
     * 1. `productCreate` —— 创建产品主体，同时获取自动创建的默认变体 ID
     * 2. `productVariantsBulkUpdate` —— 更新默认变体的 SKU、价格等信息
     * 3. `productCreateMedia` —— 添加产品图片（可选）
     *
     * @param input - 产品创建输入
     * @returns 创建成功后的产品 ID 和第一个变体 ID
     */
    async create_product(input: ShopifyProductCreateInput): Promise<{ product_id: string; variant_id: string }> {
        // Step 1: 创建产品主体（不含 variants 和 images）
        // productCreate 同时返回默认变体 ID（Shopify 自动创建 "Default Title" 变体）
        const data = await this.get_data<{ data: { productCreate: { product?: { id?: string; variants?: TShopifyDataInlineModel<{ id?: string }> }; userErrors?: Array<{ field: string[]; message: string }> } } }>(gql(`
            mutation productCreate($input: ProductInput!) {
                productCreate(input: $input) {
                    product {
                        id
                        variants(first: 1) {
                            nodes {
                                id
                            }
                        }
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            input: {
                title: input.title,
                handle: input.handle,
                descriptionHtml: input.description_html ?? '',
                vendor: input.vendor ?? '',
                productType: input.product_type ?? '',
                tags: input.tags ?? [],
                status: input.status ?? 'ACTIVE',
            },
        });

        const result = data.data.productCreate;
        if (result.userErrors?.length) {
            throw new Error(`productCreate 失败: ${JSON.stringify(result.userErrors)}`);
        }

        const product = result.product!;
        const product_gid = product.id!;
        const product_id = product_gid.replace(/^gid.*?(\d+)$/, '$1');

        // 获取 Shopify 自动创建的默认变体 ID，用 update 替代 create 避免 "Default Title already exists" 错误
        const default_variant_gid = product.variants?.nodes?.[0]?.id ?? '';
        const default_variant_id = default_variant_gid.replace(/^gid.*?(\d+)$/, '$1');

        const safe_compare_at_price = input.compare_at_price !== undefined && Number(input.compare_at_price) > 0
            ? input.compare_at_price
            : undefined;

        // Step 2: 更新默认变体的 SKU、价格等信息（而非新建变体）
        const variant_data = await this.get_data<TShopifyDataModel<'productVariantsBulkUpdate'>>(gql(`
            mutation productVariantsBulkUpdate($pid: ID!, $variants: [ProductVariantsBulkInput!]!) {
                productVariantsBulkUpdate(productId: $pid, variants: $variants) {
                    productVariants {
                        id
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            pid: product_gid,
            variants: [
                {
                    id: default_variant_gid,
                    price: input.price,
                    compareAtPrice: safe_compare_at_price,
                    inventoryItem: {
                        sku: input.sku,
                        tracked: true,
                    },
                },
            ],
        });

        const variant_result = variant_data.data.productVariantsBulkUpdate;
        if (variant_result.userErrors?.length) {
            throw new Error(`productVariantsBulkUpdate 失败: ${JSON.stringify(variant_result.userErrors)}`);
        }

        const variant_id = default_variant_id;

        // Step 3: 添加图片（如果有）
        if (input.images?.length) {
            const create_media_data = await this.get_data<TShopifyDataModel<'productCreateMedia'>>(gql(`
                mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
                    productCreateMedia(media: $media, productId: $productId) {
                        media {
                            alt
                            mediaContentType
                            status
                        }
                        mediaUserErrors {
                            field
                            message
                        }
                    }
                }
            `), {
                productId: product_gid,
                media: input.images.map(url => ({
                    originalSource: url,
                    mediaContentType: 'IMAGE',
                })),
            });

            if (create_media_data.data.productCreateMedia.mediaUserErrors?.length) {
                throw new Error(`productCreateMedia 失败: ${JSON.stringify(create_media_data.data.productCreateMedia.mediaUserErrors)}`);
            }
        }

        return { product_id, variant_id, };
    }

    /**
     * 更新 Shopify 产品。
     *
     * @param input - 产品更新输入（必须包含 id）
     */
    async update_product(input: ShopifyProductUpdateInput): Promise<void> {
        const data = await this.get_data<TShopifyDataModel<'productUpdate'>>(gql(`
            mutation productUpdate($input: ProductInput!) {
                productUpdate(input: $input) {
                    product {
                        id
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            input: {
                id: this.handle_id(input.id, 'Product'),
                ...input.title !== undefined ? { title: input.title, } : {},
                ...input.handle !== undefined ? { handle: input.handle, } : {},
                ...input.description_html !== undefined ? { descriptionHtml: input.description_html, } : {},
                ...input.tags !== undefined ? { tags: input.tags, } : {},
                ...input.status !== undefined ? { status: input.status, } : {},
            },
        });

        const result = data.data.productUpdate;
        if (result.userErrors?.length) {
            throw new Error(`productUpdate 失败: ${JSON.stringify(result.userErrors)}`);
        }
    }

    /**
     * 全量替换产品图片（先删除旧图片，再添加新图片）。
     *
     * Shopify GraphQL API 的 productUpdate 不支持 images 字段，
     * 需要先通过 productDeleteMedia 删除旧图片，再通过 productCreateMedia 添加新图片。
     *
     * @param product_id - 产品 ID
     * @param image_urls - 图片 URL 列表
     */
    async update_product_images(product_id: string, image_urls: string[]): Promise<void> {
        const product_gid = this.handle_id(product_id, 'Product');

        // 1. 查询现有图片的 media ID
        const existing = await this.get_data<{ data: { product: { media?: TShopifyDataInlineModel<{ id?: string }> } } }>(gql(`
            query($id: ID!) {
                product(id: $id) {
                    media(first: 50) {
                        nodes {
                            id
                        }
                    }
                }
            }
        `), {
            id: product_gid,
        });

        const media_ids = (existing.data.product.media?.nodes ?? [])
            .map(m => m.id!)
            .filter(Boolean);

        // 2. 删除旧图片
        if (media_ids.length) {
            const delete_data = await this.get_data<TShopifyDataModel<'productDeleteMedia'>>(gql(`
                mutation productDeleteMedia($mediaIds: [ID!]!, $productId: ID!) {
                    productDeleteMedia(mediaIds: $mediaIds, productId: $productId) {
                        deletedMediaIds
                        mediaUserErrors {
                            field
                            message
                        }
                    }
                }
            `), {
                productId: product_gid,
                mediaIds: media_ids,
            });

            if (delete_data.data.productDeleteMedia.mediaUserErrors?.length) {
                throw new Error(`productDeleteMedia 失败: ${JSON.stringify(delete_data.data.productDeleteMedia.mediaUserErrors)}`);
            }
        }

        // 3. 添加新图片
        if (image_urls.length) {
            const create_data = await this.get_data<TShopifyDataModel<'productCreateMedia'>>(gql(`
                mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
                    productCreateMedia(media: $media, productId: $productId) {
                        media {
                            alt
                            mediaContentType
                            status
                        }
                        mediaUserErrors {
                            field
                            message
                        }
                    }
                }
            `), {
                productId: product_gid,
                media: image_urls.map(url => ({
                    originalSource: url,
                    mediaContentType: 'IMAGE',
                })),
            });

            if (create_data.data.productCreateMedia.mediaUserErrors?.length) {
                throw new Error(`productCreateMedia 失败: ${JSON.stringify(create_data.data.productCreateMedia.mediaUserErrors)}`);
            }
        }
    }

    /**
     * 更新产品变体价格。
     *
     * @param product_id - 产品 ID
     * @param variant_id - 变体 ID
     * @param price - 新价格
     * @param compare_at_price - 对比价格（原价）
     */
    async update_product_price(product_id: string, variant_id: string, price: string, compare_at_price?: string): Promise<void> {
        // Shopify 不允许 compareAtPrice 为负数，非正数则跳过
        const safe_compare_at_price = compare_at_price !== undefined && Number(compare_at_price) > 0
            ? compare_at_price
            : undefined;

        const data = await this.get_data<TShopifyDataModel<'productVariantsBulkUpdate'>>(gql(`
            mutation productVariantsBulkUpdate(
                $pid: ID!,
                $variants: [ProductVariantsBulkInput!]!
            ) {
                productVariantsBulkUpdate(productId: $pid, variants: $variants) {
                    product {
                        id
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            pid: this.handle_id(product_id, 'Product'),
            variants: [
                {
                    id: this.handle_id(variant_id, 'ProductVariant'),
                    price,
                    ...safe_compare_at_price !== undefined ? { compareAtPrice: safe_compare_at_price, } : {},
                },
            ],
        });

        if (data.data.productVariantsBulkUpdate.userErrors?.length) {
            throw new Error(`update_product_price 失败: ${JSON.stringify(data.data.productVariantsBulkUpdate.userErrors)}`);
        }
    }

    /**
     * 下架产品（设置状态为 ARCHIVED）。
     *
     * @param product_id - 产品 ID
     */
    async archive_product(product_id: string): Promise<void> {
        await this.update_product({
            id: product_id,
            status: 'ARCHIVED',
        });
    }

    /**
     * 获取所有仓库位置信息。
     *
     * @returns 仓库位置列表，包含 id 和 name
     */
    async get_locations(): Promise<Array<{ id: string; name: string }>> {
        const data = await this.get_data<TShopifyDataModel<'locations'>>(gql(`
            query {
                locations(first: 10) {
                    nodes {
                        id
                        name
                    }
                }
            }
        `));

        return (data.data.locations?.nodes ?? []).map(loc => ({
            id: loc.id!.replace(/^gid.*?(\d+)$/, '$1'),
            name: loc.name ?? '',
        }));
    }

    /**
     * 设置指定仓库的库存数量。
     *
     * Shopify GraphQL API 的 `inventorySetQuantities` 要求 `InventoryQuantityInput`
     * 必须包含 `changeFromQuantity` 参数（API v2024+ 破坏性变更）。
     * 因此在设置库存前，需要先查询当前可用库存数量。
     *
     * @param inventory_item_id - 库存项 ID
     * @param location_id - 仓库位置 ID
     * @param quantity - 目标库存数量
     */
    async set_inventory_level(inventory_item_id: string, location_id: string, quantity: number): Promise<void> {
        // 1. 查询当前可用库存数量（作为 changeFromQuantity）
        const current_query = await this.get_data<{
            data: {
                inventoryItem: {
                    inventoryLevels: {
                        nodes: Array<{
                            quantities: Array<{ name: string; quantity: number }>;
                        }>;
                    };
                };
            };
        }>(gql(`
            query($id: ID!) {
                inventoryItem(id: $id) {
                    inventoryLevels(first: 50) {
                        nodes {
                            quantities(names: ["available"]) {
                                name
                                quantity
                            }
                            location {
                                id
                            }
                        }
                    }
                }
            }
        `), {
            id: this.handle_id(inventory_item_id, 'InventoryItem'),
        });

        // 找到目标 location 的当前 available 数量
        const levels = current_query.data?.inventoryItem?.inventoryLevels?.nodes ?? [];
        const target_location_gid = this.handle_id(location_id, 'Location');
        const current_level = levels.find(level => {
            const loc_gid = (level as unknown as { location?: { id?: string } })?.location?.id;
            return loc_gid === target_location_gid;
        });
        const change_from_quantity = current_level?.quantities?.[0]?.quantity ?? 0;

        // 2. 执行 inventorySetQuantities mutation（需 @idempotent 指令防止重复操作）
        const idempotency_key = `inv_${inventory_item_id}_${location_id}_${Date.now()}`;
        const data = await this.get_data<TShopifyDataModel<'inventorySetQuantities'>>(gql(`
            mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
                inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
                    inventoryAdjustmentGroup {
                        createdAt
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            input: {
                reason: 'correction',
                name: 'available',
                quantities: [
                    {
                        inventoryItemId: this.handle_id(inventory_item_id, 'InventoryItem'),
                        locationId: this.handle_id(location_id, 'Location'),
                        changeFromQuantity: change_from_quantity,
                        quantity,
                    },
                ],
            },
            idempotencyKey: idempotency_key,
        });

        // debugger;
        const result = data.data.inventorySetQuantities;
        if (result.userErrors?.length) {
            throw new Error(`set_inventory_level 失败: ${JSON.stringify(result.userErrors)}`);
        }
    }

    /**
     * 激活变体库存项在指定仓库的可用性（勾选库存地点）。
     *
     * 在 `set_inventory_level` 之前调用，确保目标仓库已被勾选激活。
     * `inventoryActivate` 是幂等操作，已激活时不会产生副作用。
     *
     * @param inventory_item_id - 库存项 ID
     * @param location_id - 仓库位置 ID
     */
    async inventoryActivate(inventory_item_id: string, location_id: string): Promise<void> {
        const idempotency_key = `inv_activate_${inventory_item_id}_${location_id}_${Date.now()}`;
        const data = await this.get_data<{ data: { inventoryActivate: { inventoryLevel?: { id?: string }; userErrors?: Array<{ field: string[]; message: string }> } } }>(gql(`
            mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!, $idempotencyKey: String!) {
                inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) @idempotent(key: $idempotencyKey) {
                    inventoryLevel {
                        id
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            inventoryItemId: this.handle_id(inventory_item_id, 'InventoryItem'),
            locationId: this.handle_id(location_id, 'Location'),
            idempotencyKey: idempotency_key,
        });

        const activate_result = data.data.inventoryActivate;
        if (activate_result.userErrors?.length) {
            throw new Error(`inventoryActivate 失败: ${JSON.stringify(activate_result.userErrors)}`);
        }
    }

    /**
     * 获取所有销售渠道 Publication（不限类型）。
     *
     * 返回每个 Publication 的 ID 和名称，用于将产品发布到全部渠道。
     * 包括 Online Store、Shop、POS、Google & YouTube、Inbox 等所有已配置的销售渠道。
     *
     * @returns Publication 列表，每项包含 publication_id 和 name
     */
    async get_all_publications(): Promise<Array<{ publication_id: string; name: string }>> {
        const all_publications: Array<{ publication_id: string; name: string }> = [];
        let cursor: string | undefined;

        const fetch_page = async (after?: string) => {
            const data = await this.get_data<{ data: { publications: { edges: Array<{ cursor?: string; node?: { id?: string; name?: string } }>; pageInfo: { hasNextPage: boolean } } } }>(gql(`
                query($after: String) {
                    publications(first: 50, after: $after) {
                        edges {
                            cursor
                            node {
                                id
                                name
                            }
                        }
                        pageInfo {
                            hasNextPage
                        }
                    }
                }
            `), {
                after: after ?? null,
            });

            const edges = data.data?.publications?.edges ?? [];
            for (const edge of edges) {
                if (edge.node?.id) {
                    all_publications.push({
                        publication_id: edge.node.id.replace(/^gid.*?(\d+)$/, '$1'),
                        name: edge.node.name ?? '',
                    });
                }
                cursor = edge.cursor;
            }

            return data.data?.publications?.pageInfo?.hasNextPage ?? false;
        };

        let has_more = await fetch_page();
        while (has_more && cursor) {
            has_more = await fetch_page(cursor);
        }

        return all_publications;
    }

    /**
     * 将产品发布到所有销售渠道。
     *
     * 通过 `get_all_publications` 获取全部 Publication，
     * 然后调用 `publishablePublish` 批量发布。
     * 用于创建产品后确保在所有渠道可见。
     *
     * @param product_gid - 产品 GID（如 `gid://shopify/Product/123`）
     */
    async publish_to_all_channels(product_gid: string): Promise<void> {
        const publications = await this.get_all_publications();
        if (!publications.length) {
            LogOrErrorSet.get_instance().push_log('无可用的销售渠道 Publication', { error: true, });
            return;
        }

        const data = await this.get_data<{ data: { publishablePublish: { userErrors?: Array<{ field: string[]; message: string }> } } }>(gql(`
            mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
                publishablePublish(id: $id, input: $input) {
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            id: product_gid,
            input: publications.map(pub => ({
                publicationId: this.handle_id(pub.publication_id, 'Publication'),
            })),
        });

        const result = data.data.publishablePublish;
        if (result.userErrors?.length) {
            throw new Error(`publish_to_all_channels 失败: ${JSON.stringify(result.userErrors)}`);
        }

        LogOrErrorSet.get_instance().push_log(
            `产品已发布到 ${publications.length} 个渠道: ${publications.map(p => p.name).join(', ')}`
        );
    }

    /**
     * 批量注册外部图片到 Shopify，返回 Shopify CDN URL。
     *
     * 直接将外部 URL（如 Amazon CDN）传给 Shopify `fileCreate` 的 `originalSource`，
     * 由 Shopify 服务端自行下载图片，无需客户端中转下载和上传。
     *
     * 流程：
     * 1. 调用 `fileCreate`，将外部 URL 作为 `originalSource` 传入
     * 2. 轮询文件状态直到 `READY`，获取 Shopify CDN URL
     *
     * @param image_urls - 外部图片 URL 列表（如 Amazon CDN）
     * @returns Shopify CDN URL 列表（仅成功处理的）
     *
     * @example
     * ```ts
     * const shopify_urls = await shopify_admin_api.upload_images_to_shopify([
     *   'https://m.media-amazon.com/images/I/xxx.jpg',
     *   'https://m.media-amazon.com/images/I/yyy.jpg',
     * ]);
     * ```
     */
    async upload_images_to_shopify(image_urls: string[]): Promise<string[]> {
        if (!image_urls.length) return [];

        const results: string[] = [];

        // 1. 直接用 fileCreate 注册外部 URL（Shopify 服务端自行下载）
        const file_create_data = await this.get_data<TShopifyDataModel<'fileCreate'>>(gql(`
            mutation fileCreate($files: [FileCreateInput!]!) {
                fileCreate(files: $files) {
                    files {
                        id
                        alt
                        createdAt
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            files: image_urls.map((url, index) => ({
                alt: `content_img_${index}`,
                contentType: 'IMAGE',
                originalSource: url,
            })),
        });

        if (file_create_data.data.fileCreate.userErrors?.length) {
            throw new Error(`fileCreate 失败: ${JSON.stringify(file_create_data.data.fileCreate.userErrors)}`);
        }

        const files = file_create_data.data.fileCreate.files ?? [];

        // 2. 逐个轮询文件状态直到 READY，获取文件 GID（用于 list.file_reference）
        for (let i = 0; i < files.length; i++) {
            const file_node = files[i];
            if (!file_node?.id) {
                LogOrErrorSet.get_instance().push_log(
                    `fileCreate 返回为空 (image_${i})`,
                    { error: true, }
                );
                continue;
            }

            const file_gid = await this.poll_file_status(file_node.id, 15, 2000);
            if (file_gid) {
                results.push(file_gid);
            }
        }

        LogOrErrorSet.get_instance().push_log(
            `内容图片注册完成: 成功 ${results.length}/${image_urls.length}`
        );

        return results;
    }

    /**
     * 轮询文件状态直到 READY 或超时。
     *
     * @param file_id - 文件 GID
     * @param max_retries - 最大重试次数
     * @param interval_ms - 每次轮询间隔（毫秒）
     * @returns 文件 GID，用于 list.file_reference 类型的 metafield；未就绪则返回空字符串
     */
    private async poll_file_status(file_id: string, max_retries: number = 10, interval_ms: number = 2000): Promise<string> {
        for (let i = 0; i < max_retries; i++) {
            await new Promise(resolve => setTimeout(resolve, interval_ms));

            const data = await this.get_data<{ data: { nodes: Array<{ id?: string; status?: string; fileStatus?: string; image?: { url?: string } }> } }>(gql(`
                query($ids: [ID!]!) {
                    nodes(ids: $ids) {
                        id
                        ... on File {
                            fileStatus
                        }
                        ... on Media {
                            status
                            ... on MediaImage {
                                image {
                                    url
                                }
                            }
                        }
                    }
                }
            `), {
                ids: [file_id,],
            });

            const file_node = data.data.nodes?.[0];
            const file_status = file_node?.fileStatus ?? file_node?.status;
            if (file_status === 'READY') {
                return file_node?.id ?? '';
            }
        }

        LogOrErrorSet.get_instance().push_log(
            `文件状态轮询超时 (${file_id})`,
            { error: true, }
        );
        return '';
    }

    // ==================== Market Publication ====================

    /**
     * 查询所有 Market 类型的 Publication。
     *
     * 返回每个 Market Publication 的 ID 和对应市场信息，
     * 用于 SyncEngine 中按站点匹配并发布产品到对应市场。
     *
     * @deprecated 请使用 {@link get_all_publications} 获取所有渠道
     * @returns Publication 列表，每项包含 publication_id 和 market_name
     */
    async get_market_publications(): Promise<Array<{ publication_id: string; market_name: string }>> {
        const data = await this.get_data<{ data: { publications: { edges: Array<{ node: { id?: string; name?: string } }> } } }>(gql(`
            query {
                publications(first: 20, catalogType: MARKET) {
                    edges {
                        node {
                            id
                            name
                        }
                    }
                }
            }
        `));

        return (data.data?.publications?.edges ?? []).map(edge => ({
            publication_id: (edge.node?.id ?? '').replace(/^gid.*?(\d+)$/, '$1'),
            market_name: edge.node?.name ?? '',
        }));
    }

    /**
     * 将产品发布到指定的 Publication（市场）。
     *
     * 使用 `publishablePublish` mutation，将产品发布到指定 Publication。
     * 发布后产品在该市场中可见。
     *
     * @param product_gid - 产品 GID（如 `gid://shopify/Product/123`）
     * @param publication_id - 目标 Publication 的数字 ID
     */
    async publish_product_to_market(product_gid: string, publication_id: string): Promise<void> {
        const data = await this.get_data<{ data: { publishablePublish: { userErrors?: Array<{ field: string[]; message: string }> } } }>(gql(`
            mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
                publishablePublish(id: $id, input: $input) {
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            id: product_gid,
            input: [{ publicationId: this.handle_id(publication_id, 'Publication'), },],
        });

        const result = data.data.publishablePublish;
        if (result.userErrors?.length) {
            throw new Error(`publish_product_to_market 失败: ${JSON.stringify(result.userErrors)}`);
        }
    }

    /**
     * 从指定的 Publication（市场）取消发布产品。
     *
     * 使用 `publishableUnpublish` mutation，从指定 Publication 取消发布。
     * 产品仍保留在店铺中，但在该市场中不可见。
     *
     * @param product_gid - 产品 GID（如 `gid://shopify/Product/123`）
     * @param publication_id - 目标 Publication 的数字 ID
     */
    async unpublish_product_from_market(product_gid: string, publication_id: string): Promise<void> {
        const data = await this.get_data<{ data: { publishableUnpublish: { userErrors?: Array<{ field: string[]; message: string }> } } }>(gql(`
            mutation PublishableUnpublish($id: ID!, $input: [PublicationInput!]!) {
                publishableUnpublish(id: $id, input: $input) {
                    userErrors {
                        field
                        message
                    }
                }
            }
        `), {
            id: product_gid,
            input: [{ publicationId: this.handle_id(publication_id, 'Publication'), },],
        });

        const result = data.data.publishableUnpublish;
        if (result.userErrors?.length) {
            throw new Error(`unpublish_product_from_market 失败: ${JSON.stringify(result.userErrors)}`);
        }
    }
}

export const init_shopify_admin_api = ShopifyAdminApi.init;
export const shopify_admin_api = new Proxy({} as ShopifyAdminApi, {
    get: (_, property) => {
        return ShopifyAdminApi.instance[property as keyof ShopifyAdminApi];
    },
});

// ==================== 类型定义 ====================

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
    name?: string;
    inventoryQuantity?: string;
    sku?: string;
    inventoryItem?: IData;
    inventoryLevels?: TShopifyDataInlineModel;
    location?: {
        name?: string,
    },
    quantities?: Array<{name?: string, quantity?: number}>,
    variants?: TShopifyDataInlineModel;
    handle?: string;
    title?: string;
    status?: string;
    descriptionHtml?: string;
    tags?: string[];
    price?: string;
    compareAtPrice?: string;
    images?: TShopifyDataInlineModel<{ url?: string; altText?: string }>;
    metafields?: TShopifyDataInlineModel<{ key?: string; value?: string; namespace?: string; type?: string }>;
    product?: { id?: string; variants?: TShopifyDataInlineModel; media?: TShopifyDataInlineModel<{ id?: string }> };
    userErrors?: Array<{field: string[], message: string}>;
    mediaUserErrors?: Array<{field: string[], message: string}>;
    media?: Array<{ id?: string; alt?: string; mediaContentType?: string; status?: string }>;
    deletedMediaIds?: string[];
    inventoryAdjustmentGroup?: { createdAt?: string };
    selectedOptions?: Array<{ name?: string; value?: string }>;
    options?: Array<{ id?: string; name?: string; values?: string[]; position?: number }>;
    /** stagedUploadsCreate 响应 */
    stagedTargets?: Array<{
        url?: string;
        resourceUrl?: string;
        parameters?: Array<{ name?: string; value?: string }>;
    }>;
    /** fileCreate 响应 */
    files?: Array<{ id?: string; alt?: string; status?: string; url?: string }>;
    /** nodes 查询响应 */
    nodes?: Array<{ id?: string; status?: string; url?: string }>;
}

/** 按 SKU 查询到的 Shopify 产品信息 */
interface ShopifyProductBySku {
    product_id: string;
    product_gid: string;
    title: string;
    handle: string;
    status: string;
    description_html: string;
    tags: string[];
    variant_id: string;
    variant_gid: string;
    sku: string;
    price: string;
    compare_at_price: string;
    inventory_item_id: string;
    inventory_item_gid: string;
    /** 产品级自定义元字段 */
    product_metafields: Array<{ key: string; value: string; namespace: string; type: string }>;
    /** 变体级自定义元字段 */
    variant_metafields: Array<{ key: string; value: string; namespace: string; type: string }>;
    /** 合并后的产品级 + 变体级元字段（向后兼容） */
    metafields: Array<{ key: string; value: string; namespace: string; type: string }>;
    images: Array<{ url: string; alt_text: string }>;
    /** 所有变体列表 */
    variants: Array<{
        variant_id: string;
        variant_gid: string;
        sku: string;
        title: string;
        price: string;
        compare_at_price: string;
        selected_options: Array<{ name: string; value: string }>;
        inventory_item_id: string;
        inventory_item_gid: string;
        metafields: Array<{ key: string; value: string; namespace: string; type: string }>;
    }>;
    /** 产品选项（如颜色、尺寸等） */
    product_options: Array<{
        id: string;
        name: string;
        values: string[];
        position: number;
    }>;
}

/** 创建产品时的输入参数 */
interface ShopifyProductCreateInput {
    title: string;
    handle: string;
    sku: string;
    price: string;
    compare_at_price?: string;
    description_html?: string;
    vendor?: string;
    product_type?: string;
    tags?: string[];
    status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
    images?: string[];
}

/** 更新产品时的输入参数 */
interface ShopifyProductUpdateInput {
    id: string;
    title?: string;
    handle?: string;
    description_html?: string;
    tags?: string[];
    status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
}

export type {
    ShopifyProductBySku,
    ShopifyProductCreateInput,
    ShopifyProductUpdateInput
};

const gql = (s: string) => s;
