import { IAmazonData, IOtherData } from '../types/index.type';
import { LogOrErrorSet } from '@/utils';
import { shopify_admin_api, ShopifyProductBySku } from '../shopify_admin_api';
import { table } from '../database';

/**
 * 同步引擎 —— 遍历 Amazon 数据，通过 Shopify Admin API 自动同步产品。
 *
 * 核心流程：
 * 1. 从 amazon_product 表读取数据（按站点过滤）
 * 2. 对每个 SKU 查询 Shopify API
 * 3. 不存在 → 创建产品
 * 4. 存在 → 逐字段对比，有差异则更新
 * 5. Amazon 无价格 → 自动下架
 * 6. 按站点分配库存（us→US 仓库, ca→CA 仓库）
 *
 * 并发度控制为 2，避免触发 Shopify API 速率限制。
 *
 * @example
 * ```ts
 * // 默认行为：出错后继续处理剩余 SKU
 * const engine = new SyncEngine('us');
 * const results = await engine.start();
 * ```
 *
 * @example
 * ```ts
 * // 开启中断：遇到第一个错误后停止后续同步
 * const engine = new SyncEngine('us', [], { abort_on_error: true });
 * const results = await engine.start();
 * ```
 */
export class SyncEngine {
    private site: string;
    private assign_skus: string[];
    private concurrency = 2;
    /** 遇到错误时是否中断后续执行 */
    private abort_on_error: boolean;
    /** 仓库位置缓存 { site → location_id } */
    private location_cache: Record<string, string> = {};
    /** 市场 Publication 缓存 —— 因 Shopify 权限问题暂时禁用
    private publication_cache: Record<string, string> = {};
    private site_market_map: Record<string, string> = {};
    */

    constructor(site: string, assign_skus: string[] = [], options?: { abort_on_error?: boolean }) {
        this.site = site;
        this.assign_skus = assign_skus;
        this.abort_on_error = options?.abort_on_error ?? false;
    }

    /**
     * 启动同步流程。
     *
     * @returns 同步结果数组
     */
    async start(): Promise<SyncResult[]> {
        LogOrErrorSet.get_instance().push_log('开始同步引擎', { title: true, });

        // debugger;
        // 1. 加载仓库位置
        await this.load_locations();

        // 1.5. 加载市场 Publication —— 因 Shopify 权限问题暂时禁用
        // await this.load_publications();

        // 2. 从 amazon_product 表读取数据
        const amazon_data = await this.load_amazon_data();
        LogOrErrorSet.get_instance().push_log(`加载 Amazon 数据: ${amazon_data.length} 条`);

        if (!amazon_data.length) {
            LogOrErrorSet.get_instance().push_log('无 Amazon 数据可同步', { error: true, });
            return [];
        }

        // 3. 并发执行同步
        const results = await this.run_with_concurrency(amazon_data);

        // 4. 统计
        const stats = results.reduce((acc, r) => {
            acc[r.type] = (acc[r.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        LogOrErrorSet.get_instance().push_log(
            `同步完成: 新增${stats.add || 0}, 更新${stats.update || 0}, 重新激活${stats.reactivated || 0}, 跳过${stats.skip || 0}, 下架${stats.archived || 0}, 失败${stats.error || 0}`,
            { repeat: true, }
        );

        return results;
    }

    /**
     * 从 amazon_product 表加载数据。
     */
    private async load_amazon_data(): Promise<IAmazonData[]> {
        const conditions: string[] = [`site='${this.site}'`,];
        if (this.assign_skus.length) {
            const sku_list = this.assign_skus.map(s => `"${s}"`).join(',');
            conditions.push(`sku in (${sku_list})`);
        }
        const where = conditions.join(' and ');
        return (await table.amazon_product.get_data(where)).sku_data;
    }

    /**
     * 加载仓库位置信息，缓存 site → location_id 映射。
     */
    private async load_locations(): Promise<void> {
        try {
            const locations = await shopify_admin_api.get_locations();
            for (const loc of locations) {
                const name_lower = loc.name.toLowerCase();
                // 匹配 US/CA 仓库
                if (name_lower.includes('us') || name_lower.includes('united states')) {
                    this.location_cache['us'] = loc.id;
                }
                if (name_lower.includes('ca') || name_lower.includes('canada')) {
                    this.location_cache['ca'] = loc.id;
                }
            }
            // 如果没匹配到，用第一个作为默认
            if (!this.location_cache['us'] && locations.length > 0) {
                this.location_cache['us'] = locations[0].id;
            }
            if (!this.location_cache['ca'] && locations.length > 1) {
                this.location_cache['ca'] = locations[1].id;
            }
            LogOrErrorSet.get_instance().push_log(`仓库位置: US=${this.location_cache['us'] || '无'}, CA=${this.location_cache['ca'] || '无'}`);
        }
        catch (error) {
            LogOrErrorSet.get_instance().push_log(`加载仓库位置失败: ${LogOrErrorSet.get_instance().save_error(error)}`, { error: true, });
        }
    }

    /**
     * 加载市场 Publication 信息 —— 因 Shopify 权限问题暂时禁用
     *
     * 原逻辑：缓存 market_name_lower → publication_id 映射。
     * 同时构建站点到市场名称的映射（如 us → United States, ca → Canada），
     * 用于后续验证产品是否已发布到对应市场。
     */
    // private async load_publications(): Promise<void> {
    //     try {
    //         const publications = await shopify_admin_api.get_market_publications();
    //         for (const pub of publications) {
    //             const name_lower = pub.market_name.toLowerCase();
    //             this.publication_cache[name_lower] = pub.publication_id;
    //         }
    //         LogOrErrorSet.get_instance().push_log(
    //             `市场 Publications: ${publications.map(p => `${p.market_name}=${p.publication_id}`).join(', ') || '无'}`
    //         );
    //     }
    //     catch (error) {
    //         LogOrErrorSet.get_instance().push_log(
    //             `加载市场 Publications 失败: ${LogOrErrorSet.get_instance().save_error(error)}`,
    //             { error: true, }
    //         );
    //     }
    // }

    /**
     * 根据站点代码查找对应的 Publication ID —— 因 Shopify 权限问题暂时禁用。
     *
     * 匹配逻辑：将站点代码（小写）与市场名称（小写）进行包含匹配。
     * - `us` → 匹配包含 `us` 或 `united states` 的市场
     * - `ca` → 匹配包含 `ca` 或 `canada` 的市场
     *
     * @param site - Amazon 站点代码（如 'us'、'ca'）
     * @returns 匹配的 Publication ID，未找到返回 null
     */
    // private find_publication_by_site(site: string): string | null {
    //     const site_lower = site.toLowerCase();
    //
    //     // 直接匹配：市场名称包含站点代码
    //     for (const [name_lower, pub_id,] of Object.entries(this.publication_cache)) {
    //         if (name_lower.includes(site_lower)) {
    //             return pub_id;
    //         }
    //     }
    //
    //     // 扩展匹配：常见站点 → 市场名称映射
    //     const site_market_aliases: Record<string, string[]> = {
    //         us: ['united states', 'united states of america', 'america',],
    //         ca: ['canada',],
    //     };
    //     const aliases = site_market_aliases[site_lower] ?? [];
    //     for (const alias of aliases) {
    //         for (const [name_lower, pub_id,] of Object.entries(this.publication_cache)) {
    //             if (name_lower.includes(alias)) {
    //                 return pub_id;
    //             }
    //         }
    //     }
    //
    //     return null;
    // }

    /**
     * 验证并确保产品已发布到对应站点的市场 Publication —— 因 Shopify 权限问题暂时禁用。
     *
     * 如果产品未发布到目标市场，自动调用 publish_product_to_market 进行发布。
     *
     * @param product_id - 产品 ID（数字或 GID 均可）
     * @param site - Amazon 站点代码（如 'us'、'ca'）
     */
    // private async verify_market_publication(product_id: string, site?: string): Promise<void> {
    //     const target_site = (site || this.site).toLowerCase();
    //     const publication_id = this.find_publication_by_site(target_site);
    //
    //     if (!publication_id) {
    //         LogOrErrorSet.get_instance().push_log(
    //             `站点 ${target_site} 未找到对应的市场 Publication，跳过区域发布验证`,
    //             { error: true, }
    //         );
    //         return;
    //     }
    //
    //     const product_gid = product_id.startsWith('gid://')
    //         ? product_id
    //         : `gid://shopify/Product/${product_id}`;
    //
    //     try {
    //         // publishablePublish 是幂等操作，已发布时不会产生副作用
    //         await shopify_admin_api.publish_product_to_market(product_gid, publication_id);
    //         LogOrErrorSet.get_instance().push_log(
    //             `产品已发布到站点 ${target_site} 的市场 (publication: ${publication_id})`
    //         );
    //     }
    //     catch (error) {
    //         LogOrErrorSet.get_instance().push_log(
    //             `发布到站点 ${target_site} 市场失败: ${LogOrErrorSet.get_instance().save_error(error)}`,
    //             { error: true, }
    //         );
    //     }
    // }

    /**
     * 从对应站点的市场 Publication 取消发布产品 —— 因 Shopify 权限问题暂时禁用。
     *
     * @param product_id - 产品 ID（数字或 GID 均可）
     * @param site - Amazon 站点代码（如 'us'、'ca'）
     */
    // private async unpublish_from_market(product_id: string, site?: string): Promise<void> {
    //     const target_site = (site || this.site).toLowerCase();
    //     const publication_id = this.find_publication_by_site(target_site);
    //
    //     if (!publication_id) {
    //         LogOrErrorSet.get_instance().push_log(
    //             `站点 ${target_site} 未找到对应的市场 Publication，跳过取消发布`,
    //             { error: true, }
    //         );
    //         return;
    //     }
    //
    //     const product_gid = product_id.startsWith('gid://')
    //         ? product_id
    //         : `gid://shopify/Product/${product_id}`;
    //
    //     try {
    //         await shopify_admin_api.unpublish_product_from_market(product_gid, publication_id);
    //         LogOrErrorSet.get_instance().push_log(
    //             `产品已从站点 ${target_site} 的市场取消发布 (publication: ${publication_id})`
    //         );
    //     }
    //     catch (error) {
    //         LogOrErrorSet.get_instance().push_log(
    //             `从站点 ${target_site} 市场取消发布失败: ${LogOrErrorSet.get_instance().save_error(error)}`,
    //             { error: true, }
    //         );
    //     }
    // }

    /**
     * 并发控制执行同步。
     *
     * 当 {@link SyncEngine.abort_on_error} 为 true 时，任一 worker 遇到异常后会设置中断标志，
     * 其余 worker 在处理完当前任务后将跳过后续任务，已完成的 SKU 不受影响。
     *
     * @param items - Amazon 数据列表
     * @returns 同步结果数组
     */
    private async run_with_concurrency(items: IAmazonData[]): Promise<SyncResult[]> {
        const results: SyncResult[] = [];
        let index = 0;
        /** 中断标志 —— 当 abort_on_error 为 true 且有 worker 报错时置为 true，其余 worker 跳过后续任务 */
        let aborted = false;

        const worker = async () => {
            while (index < items.length) {
                // 检查是否已中断
                if (this.abort_on_error && aborted) {
                    break;
                }

                const current_index = index++;
                const item = items[current_index];
                try {
                    const result = await this.sync_one(item);
                    results.push(result);
                    LogOrErrorSet.get_instance().push_log(
                        `[${current_index + 1}/${items.length}] ${item.sku}: ${result.type}${result.changed_fields?.length ? ` (${result.changed_fields.join(',')})` : ''}`,
                        { repeat: true, }
                    );
                }
                catch (error) {
                    const msg = LogOrErrorSet.get_instance().save_error(error);
                    results.push({ sku: item.sku, type: 'error', error: msg, });
                    LogOrErrorSet.get_instance().push_log(
                        `[${current_index + 1}/${items.length}] ${item.sku}: error - ${msg}`,
                        { repeat: true, error: true, }
                    );

                    // 如果开启了中断，标记并退出 worker
                    if (this.abort_on_error) {
                        aborted = true;
                        LogOrErrorSet.get_instance().push_log(
                            `abort_on_error 已开启，同步中断（已处理 ${results.length}/${items.length}）`,
                            { repeat: true, error: true, }
                        );
                        break;
                    }
                }
            }
        };

        // 启动 N 个 worker
        const workers = Array.from({ length: this.concurrency, }, () => worker());
        await Promise.all(workers);

        return results;
    }

    /**
     * 同步单个产品。
     *
     * 处理逻辑：
     * 1. Amazon 无价格 → 下架或跳过
     * 2. Amazon 有价格 + Shopify 无产品 → 创建
     * 3. Amazon 有价格 + Shopify 有活跃产品 → 更新
     * 4. Amazon 有价格 + Shopify 有归档产品 → 重新激活并更新
     *
     * @param amazon_item - Amazon 产品数据
     * @returns 同步结果
     */
    private async sync_one(amazon_item: IAmazonData): Promise<SyncResult> {
        const sku = amazon_item.sku;
        const detail_map = amazon_item.detail_map;

        // 检查是否有价格
        const has_price = detail_map?.get_price
            && !detail_map.get_price.error
            && detail_map.get_price.data
            && (detail_map.get_price.data as IOtherData).price;

        // 查询 Shopify 是否已有活跃产品
        const shopify_product = await shopify_admin_api.get_product_by_sku(sku);

        // 情况1: Amazon 无价格
        if (!has_price) {
            if (shopify_product) {
                // Shopify 有活跃产品 → 下架
                await shopify_admin_api.archive_product(shopify_product.product_id);
                // 从对应市场取消发布 —— 因 Shopify 权限问题暂时禁用
                // await this.unpublish_from_market(shopify_product.product_gid, amazon_item.site);
                return { sku, type: 'archived', shopify_product_id: shopify_product.product_id, };
            }
            // Shopify 也没有活跃产品 → 跳过
            return { sku, type: 'skip', };
        }

        // 以下情况 Amazon 都有价格

        // 情况2: Shopify 没有活跃产品 → 检查是否有归档产品
        if (!shopify_product) {
            const archived_product = await shopify_admin_api.get_product_by_sku_any_status(sku);
            if (archived_product && archived_product.status === 'ARCHIVED') {
                // 找到归档产品 → 重新激活并更新
                return await this.reactivate_product(amazon_item, archived_product);
            }
            // 真的没有 → 创建
            return await this.create_product(amazon_item);
        }

        // 情况3: Shopify 已有活跃产品 → 对比并更新
        return await this.update_product_if_needed(amazon_item, shopify_product);
    }

    /**
     * 创建新产品。
     *
     * 创建流程：
     * 1. 通过 `shopify_admin_api.create_product` 创建产品主体（标题、SKU、价格、图片）
     * 2. 通过 `apply_product_updates` 补充描述、标签、变体选项、metafield 等字段，
     *    与 `update_product_if_needed` 保持一致
     *
     * @param amazon_item - Amazon 产品数据
     * @returns 同步结果
     */
    private async create_product(amazon_item: IAmazonData): Promise<SyncResult> {
        const sku = amazon_item.sku;
        const detail_map = amazon_item.detail_map;
        const price_data = (detail_map?.get_price?.data ?? {}) as IOtherData;

        const price = (price_data.price ?? 0).toFixed(2);
        const compare_at_price = price_data.old_price ? price_data.old_price.toFixed(2) : '';

        // 收集图片
        const banner_imgs = (detail_map?.get_banner_imgs?.data ?? []) as string[];
        const all_images = [...banner_imgs,].filter(Boolean);

        const result = await shopify_admin_api.create_product({
            title: (detail_map?.get_title?.data ?? '') as string,
            handle: sku,
            sku,
            price,
            compare_at_price: compare_at_price || undefined,
            status: 'ACTIVE',
            images: all_images.length ? all_images : undefined,
        });

        // ── 补充字段：与 update_product_if_needed 保持一致 ──
        try {
            const updates: Parameters<typeof this.apply_product_updates>[2] = {
                site: amazon_item.site,
            };

            // 描述
            const amazon_description = ((detail_map?.get_desc_text?.data) as IOtherData).html || '';
            if (amazon_description) {
                updates.description = amazon_description;
            }

            // 标签
            const amazon_tag = (detail_map?.get_relevance_tag?.data || '') as string;
            if (amazon_tag) {
                updates.tags = [amazon_tag,];
            }

            // 变体选项（sku_model）
            const amazon_sku_model = (detail_map?.get_sku_model?.data || '') as string;
            if (amazon_sku_model) {
                // debugger;
                // 新创建的产品默认只有一个选项，查询产品获取 product_options
                const created_product = await shopify_admin_api.get_product_by_sku(sku);
                if (created_product) {
                    const model_option = created_product.product_options.find(
                        opt => opt.name.toLowerCase() === 'model'
                    );
                    // debugger;
                    if (model_option) {
                        // 选项已存在，直接更新值
                        updates.variant_option = {
                            optionId: model_option.id,
                            name: amazon_sku_model,
                        };
                    }
                    else {
                        // 选项不存在，先创建 model 选项再设置值
                        try {
                            const option_gid = await shopify_admin_api.create_product_option(
                                result.product_id,
                                'model',
                                [amazon_sku_model,]
                            );
                            // create_product_option 已在创建时设置了值，无需再更新
                            LogOrErrorSet.get_instance().push_log(
                                `产品 ${sku} 已创建 model 选项并设置值: ${amazon_sku_model} (${option_gid})`
                            );
                        }
                        catch (option_error) {
                            LogOrErrorSet.get_instance().push_log(
                                `产品 ${sku} 创建 model 选项失败: ${LogOrErrorSet.get_instance().save_error(option_error)}`,
                                { error: true, }
                            );
                        }
                    }
                }
            }

            // ── 收集需要设置的 metafield ──
            const metafields_to_update: Array<{ key: string; value: string; type?: string }> = [];

            // recommend（精选标识）
            const amazon_choice = ((detail_map?.get_choice?.data || '') as string) === '1';
            metafields_to_update.push({
                key: 'recommend',
                type: 'boolean',
                value: amazon_choice ? 'true' : 'false',
            });

            // item_details（详情）
            const amazon_detail = (detail_map?.get_detail?.data || '') as string;
            metafields_to_update.push({
                key: 'item_details',
                type: 'multi_line_text_field',
                value: amazon_detail,
            });

            // product_reviews（评论数据）
            const amazon_review_data = (detail_map?.get_review_data?.data || '[]') as string;
            metafields_to_update.push({
                key: 'product_reviews',
                type: 'json',
                value: amazon_review_data,
            });

            // amazon_address（Amazon 地址 URL）
            const amazon_address_url = (detail_map?.amazon_address_url?.data || '') as string;
            if (amazon_address_url) {
                metafields_to_update.push({
                    key: 'amazon_address',
                    type: 'link',
                    value: JSON.stringify({
                        text: sku,
                        url: amazon_address_url,
                    }),
                });
            }

            // functions_and_specifications（特征规格）
            const amazon_features_specs = (detail_map?.get_features_specs?.data || '') as string;
            metafields_to_update.push({
                key: 'functions_and_specifications',
                type: 'multi_line_text_field',
                value: amazon_features_specs,
            });

            // product_description（内容图片 → 上传到 Shopify 获取 GID）
            const amazon_content_imgs = (detail_map?.get_content_imgs?.data ?? []) as string[];
            if (amazon_content_imgs.length > 0) {
                try {
                    const uploaded_gids = await shopify_admin_api.upload_images_to_shopify(amazon_content_imgs);
                    metafields_to_update.push({
                        key: 'product_description',
                        type: 'list.file_reference',
                        value: JSON.stringify(uploaded_gids),
                    });
                }
                catch (error) {
                    LogOrErrorSet.get_instance().push_log(
                        `产品 ${sku} 上传内容图片失败: ${LogOrErrorSet.get_instance().save_error(error)}`,
                        { error: true, }
                    );
                }
            }

            // product_description_assisted_rendering（内容 JSON）
            const amazon_content_json = (detail_map?.get_content_json?.data || '{}') as string;
            metafields_to_update.push({
                key: 'product_description_assisted_rendering',
                type: 'json',
                value: amazon_content_json,
            });

            if (metafields_to_update.length > 0) {
                updates.metafields = metafields_to_update;
            }

            // 执行补充更新（含库存设置）
            await this.apply_product_updates(
                result.product_id,
                result.variant_id,
                updates
            );
        }
        catch (error) {
            // 创建已成功，补充字段失败仅记录日志，不中断流程
            LogOrErrorSet.get_instance().push_log(
                `产品 ${sku} 创建后补充字段失败: ${LogOrErrorSet.get_instance().save_error(error)}`,
                { error: true, }
            );
        }

        // 确保库存已设置（补充字段失败时作为兜底）
        await this.set_site_inventory(result.variant_id, amazon_item.site);

        // 验证并发布到对应市场 —— 因 Shopify 权限问题暂时禁用
        // await this.verify_market_publication(result.product_id, amazon_item.site);

        return {
            sku,
            type: 'add',
            shopify_product_id: result.product_id,
        };
    }

    /**
     * 重新激活已归档的产品。
     *
     * 当一个之前被归档的产品重新出现在 Amazon 且有价格时，
     * 通过 GraphQL 将其状态从 ARCHIVED 改回 ACTIVE，并同步更新所有字段。
     *
     * @param amazon_item - Amazon 产品数据
     * @param archived_product - Shopify 已归档的产品信息
     * @returns 同步结果（type 为 'reactivated'）
     */
    private async reactivate_product(
        amazon_item: IAmazonData,
        archived_product: ShopifyProductBySku
    ): Promise<SyncResult> {
        const sku = amazon_item.sku;
        LogOrErrorSet.get_instance().push_log(
            `产品 ${sku} 在 Shopify 中处于归档状态，准备重新激活`,
            { repeat: true, }
        );

        try {
            // 1. 先激活产品
            await shopify_admin_api.update_product({
                id: archived_product.product_id,
                status: 'ACTIVE',
            });

            LogOrErrorSet.get_instance().push_log(
                `产品 ${sku} 已重新激活 (product_id: ${archived_product.product_id})`
            );

            // 2. 复用 update_product_if_needed 同步所有字段
            const result = await this.update_product_if_needed(amazon_item, archived_product);

            // 3. 验证并发布到对应市场 —— 因 Shopify 权限问题暂时禁用
            // await this.verify_market_publication(archived_product.product_gid, amazon_item.site);

            return {
                ...result,
                type: 'reactivated',
                changed_fields: ['status', ...result.changed_fields ?? [],],
            };
        }
        catch (error) {
            const msg = LogOrErrorSet.get_instance().save_error(error);
            LogOrErrorSet.get_instance().push_log(
                `重新激活产品 ${sku} 失败: ${msg}`,
                { error: true, }
            );
            throw error;
        }
    }

    /**
     * 安全获取 metafield 值。
     *
     * @param metafields - metafield 数组
     * @param key - 要查找的 key
     * @param defaultValue - 默认值
     * @returns metafield 的 value，如果不存在则返回默认值
     */
    private get_safe_metafield(
        metafields: Array<{ key: string; value: string }> | undefined,
        key: string,
        defaultType: 'link' | 'multi_line_text_field' | 'json' | 'boolean' | 'list.file_reference',
        defaultValue: string = ''
    ) {
        const default_item = {
            key,
            namespace: 'custom',
            type: defaultType,
            value: defaultValue,
        };
        try {
            if (!Array.isArray(metafields)) return default_item;
            const mf = metafields.find(ii => ii.key === key);
            return {
                ...default_item,
                ...mf,
            };
        }
        catch (error) {
            LogOrErrorSet.get_instance().push_log(
                `获取 metafield "${key}" 异常: ${LogOrErrorSet.get_instance().save_error(error)}`,
                { error: true, }
            );
        }
        return default_item;
    }

    /**
     * 执行产品更新操作（创建和更新时复用）。
     *
     * @param product_id - Shopify 产品 ID
     * @param variant_id - Shopify 变体 ID
     * @param updates - 要执行的更新字段集合
     * @returns 是否所有更新都成功
     */
    private async apply_product_updates(
        product_id: string,
        variant_id: string,
        updates: {
            title?: string;
            price?: { price: string; compare_at_price?: string };
            images?: string[];
            description?: string;
            tags?: string[];
            /** 需要更新的产品级 metafield 列表 */
            metafields?: Array<{ key: string; value: string; type?: string }>;
            /** 变体选项更新：需包含 optionId 和新的 name */
            variant_option?: { optionId: string; name: string };
            /** Amazon 站点代码，用于按站点设置库存 */
            site?: string;
        }
    ): Promise<void> {
        try {
            // 更新标题
            if (updates.title !== undefined) {
                await shopify_admin_api.update_product({
                    id: product_id,
                    title: updates.title,
                });
            }

            // 更新价格
            if (updates.price) {
                await shopify_admin_api.update_product_price(
                    product_id,
                    variant_id,
                    updates.price.price,
                    updates.price.compare_at_price
                );
            }

            // 更新图片
            if (updates.images && updates.images.length > 0) {
                await shopify_admin_api.update_product_images(product_id, updates.images);
            }

            // 更新描述
            if (updates.description !== undefined) {
                await shopify_admin_api.update_product({
                    id: product_id,
                    description_html: updates.description,
                });
            }

            // 更新标签
            if (updates.tags !== undefined) {
                await shopify_admin_api.update_product({
                    id: product_id,
                    tags: updates.tags,
                });
            }

            // 更新变体选项值
            if (updates.variant_option) {
                await shopify_admin_api.update_variant_option(
                    product_id,
                    variant_id,
                    [updates.variant_option,]
                );
            }

            // debugger;
            // 更新产品级 metafields（批量设置）
            if (updates.metafields && updates.metafields.length > 0) {
                await shopify_admin_api.clear_product_metafields(product_id, updates.metafields.filter(ii => ii.value === '').map(ii => ii.key));
                await shopify_admin_api.set_product_metafields_v2(product_id, updates.metafields.filter(ii => ii.value === undefined || ii.value === null || ii.value !== ''));
            }

            // 按站点设置库存
            if (updates.site) {
                await this.set_site_inventory(variant_id, updates.site);
            }

        }
        catch (error) {
            const msg = LogOrErrorSet.get_instance().save_error(error);
            LogOrErrorSet.get_instance().push_log(
                `执行产品更新失败 (product:${product_id}): ${msg}`,
                { error: true, }
            );
            throw error;
        }
    }

    /**
     * 对比并更新已有产品。
     *
     * @param amazon_item - Amazon 产品数据
     * @param shopify_product - Shopify 已有产品信息
     * @returns 同步结果
     */
    private async update_product_if_needed(
        amazon_item: IAmazonData,
        shopify_product: ShopifyProductBySku
    ): Promise<SyncResult> {
        const sku = amazon_item.sku;
        const detail_map = amazon_item.detail_map;
        const changed_fields: string[] = [];

        // debugger;
        // ── 对比标题 (get_title) ──
        const amazon_title = (detail_map?.get_title?.data ?? '') as string;
        {
            if (amazon_title && amazon_title !== shopify_product.title) {
                changed_fields.push('title');
            }
        }

        // ── 对比价格（get_price） ──
        const price_data = (detail_map?.get_price?.data ?? {}) as IOtherData;
        const amazon_price = (price_data.price ?? 0).toFixed(2);
        const amazon_compare_at = price_data.old_price ? price_data.old_price.toFixed(2) : '';
        {
            if (amazon_price !== shopify_product.price) {
                changed_fields.push('price');
            }
            else if (amazon_compare_at !== shopify_product.compare_at_price) {
                // 价格相同时，原价比当前价格低时不修改（与 compare.ts 逻辑一致）
                if (!(price_data.old_price && price_data.price && price_data.old_price <= price_data.price)) {
                    changed_fields.push('price');
                }
            }
        }

        // ── 对比图片（get_banner_imgs） ──
        const amazon_banner_imgs = (detail_map?.get_banner_imgs?.data ?? []) as string[];
        {
            const shopify_img_count = shopify_product.images.length;
            if (amazon_banner_imgs.length !== shopify_img_count) {
                changed_fields.push('images');
            }
        }

        // ── 对比描述（get_desc_text） ──
        const amazon_description = ((detail_map?.get_desc_text?.data) as IOtherData).html || '';
        {
            const shopify_description = (shopify_product.description_html ?? '').trim();
            if (amazon_description !== shopify_description) {
                changed_fields.push('description');
            }
        }

        // ── 对比标签（get_relevance_tag） ──
        const amazon_tag = (amazon_item.detail_map?.get_relevance_tag.data || '') as string;
        {
            const shopify_tag = shopify_product.tags?.[0] || '';
            if (amazon_tag !== shopify_tag) {
                changed_fields.push('tags');
            }
        }

        // ── 对比型号(get_sku_model) ──
        const amazon_sku_model = (detail_map?.get_sku_model?.data || '') as string;
        const shopify_sku_model = shopify_product.variants[0].selected_options.find(ii => ii.name === 'model');
        {
            if (amazon_sku_model !== (shopify_sku_model?.value || '')) {
                changed_fields.push('sku_model');
            }
        }

        // 元字段对比，部分字段需要特殊处理

        // 对比精选标识(get_choice)
        const amazon_choice = ((amazon_item.detail_map?.get_choice.data || '') as string) === '1';
        const shopify_recommend = this.get_safe_metafield(shopify_product.metafields, 'recommend', 'boolean', 'false');
        const shopify_recommend_val = shopify_recommend.value;
        {
            if (amazon_choice !== (shopify_recommend_val === 'true')) {
                changed_fields.push('choice');
            }
        }

        // ── 对比 Amazon 地址 URL(amazon_address_url) ──
        const amazon_address_url = (amazon_item.detail_map?.amazon_address_url?.data || '') as string;
        const shopify_amazon_address = this.get_safe_metafield(shopify_product.metafields, 'amazon_address', 'link', '{"text": "", "url": ""}');
        const shopify_amazon_address_val = shopify_amazon_address.value;
        {
            try {
                // 如果 Amazon URL 为空，或 Shopify 中不包含该 SKU，则标记需要更新
                if (amazon_address_url && (!shopify_amazon_address_val || !shopify_amazon_address_val.match(new RegExp(sku, 'i')))) {
                    changed_fields.push('amazon_address_url');
                }
            }
            catch (error) {
                LogOrErrorSet.get_instance().push_log(
                    `对比 Amazon 地址异常: ${LogOrErrorSet.get_instance().save_error(error)}`,
                    { error: true, }
                );
                changed_fields.push('amazon_address_url');
            }
        }

        // ── 对比详情(get_detail) ──
        const amazon_detail = (detail_map?.get_detail?.data || '') as string;
        const shopify_detail = this.get_safe_metafield(shopify_product.metafields, 'item_details', 'multi_line_text_field', '');
        const shopify_detail_val = shopify_detail.value;
        {
            if (amazon_detail !== shopify_detail_val) {
                changed_fields.push('detail');
            }
        }

        // ── 对比特征规格(get_features_specs) ──
        const amazon_features_specs = (detail_map?.get_features_specs?.data || '') as string;
        const shopify_features_specs = this.get_safe_metafield(
            shopify_product.metafields,
            'functions_and_specifications',
            'multi_line_text_field',
            ''
        );
        const shopify_features_specs_val = shopify_features_specs.value;
        {
            if (amazon_features_specs !== shopify_features_specs_val) {
                changed_fields.push('features_specs');
            }
        }

        // ── 对比内容图片(get_content_imgs) ──
        const amazon_content_imgs = (detail_map?.get_content_imgs?.data ?? []) as string[];
        const shopify_content_imgs_mf = this.get_safe_metafield(shopify_product.metafields, 'product_description', 'list.file_reference', '');
        const shopify_content_imgs_mf_val = shopify_content_imgs_mf.value;
        {
            try {
                const shopify_content_imgs = (shopify_content_imgs_mf_val ? JSON.parse(shopify_content_imgs_mf_val) : []) as string[];
                if (amazon_content_imgs.length !== shopify_content_imgs.length) {
                    changed_fields.push('content_imgs');
                }
            }
            catch (error) {
                LogOrErrorSet.get_instance().push_log(
                    `解析内容图片 JSON 异常: ${LogOrErrorSet.get_instance().save_error(error)}`,
                    { error: true, }
                );
                changed_fields.push('content_imgs');
            }
        }

        // ── 对比内容 JSON(get_content_json) ──
        const amazon_content_json = (detail_map?.get_content_json?.data || '{}') as string;
        const shopify_content_json_mf = this.get_safe_metafield(
            shopify_product.metafields,
            'product_description_assisted_rendering',
            'json',
            '{}'
        );
        const shopify_content_json_mf_val = shopify_content_json_mf.value;
        {
            if (amazon_content_json !== shopify_content_json_mf_val) {
                changed_fields.push('content_json');
            }
        }

        // ── 对比评论数据(get_review_data) ──
        const amazon_review_data = (detail_map?.get_review_data?.data || '[]') as string;
        const shopify_review_data_mf = this.get_safe_metafield(shopify_product.metafields, 'product_reviews', 'json', '[]');
        const shopify_review_data_mf_val = shopify_review_data_mf.value;
        {
            if (amazon_review_data !== shopify_review_data_mf_val) {
                changed_fields.push('review_data');
            }
        }

        // console.log('amazon_item', amazon_item);
        // console.log('shopify_product', shopify_product);
        // debugger;

        // 无变更 → 跳过
        if (!changed_fields.length) {
            // 仍然设置库存（确保站点库存正确）
            await this.set_site_inventory(shopify_product.variant_id, amazon_item.site);
            return { sku, type: 'skip', shopify_product_id: shopify_product.product_id, };
        }

        // ── 执行更新 ──
        try {
            const updates: Parameters<typeof this.apply_product_updates>[2] = {
                site: amazon_item.site,
            };

            if (changed_fields.includes('title')) {
                updates.title = amazon_title;
            }

            if (changed_fields.includes('price')) {
                updates.price = {
                    price: amazon_price,
                    compare_at_price: amazon_compare_at || undefined,
                };
            }

            if (changed_fields.includes('images')) {
                updates.images = amazon_banner_imgs;
            }

            if (changed_fields.includes('description')) {
                updates.description = amazon_description;
            }

            if (changed_fields.includes('tags')) {
                updates.tags = amazon_tag ? [amazon_tag,] : [];
            }

            // ── 收集需要更新的 metafield ──
            const metafields_to_update: Array<{ key: string; value: string; type?: string }> = [];

            if (changed_fields.includes('sku_model')) {
                // 更新变体选项值（model）
                const model_option = shopify_product.product_options.find(
                    opt => opt.name.toLowerCase() === 'model'
                );
                if (model_option) {
                    updates.variant_option = {
                        optionId: model_option.id,
                        name: amazon_sku_model,
                    };
                }
                else {
                    LogOrErrorSet.get_instance().push_log(
                        `产品 ${sku} 未找到 model 选项，跳过 sku_model 更新`,
                        { error: true, }
                    );
                }
            }

            if (changed_fields.includes('choice')) {
                // 更新 recommend 元字段：'1' → 'true', 其他 → 'false'
                metafields_to_update.push({
                    ...shopify_recommend,
                    value: amazon_choice ? 'true' : 'false',
                });
            }

            if (changed_fields.includes('detail')) {
                // 更新 item_details 元字段
                metafields_to_update.push({
                    ...shopify_detail,
                    value: amazon_detail,
                });
            }

            if (changed_fields.includes('review_data')) {
                // 更新 product_reviews 元字段
                metafields_to_update.push({
                    ...shopify_review_data_mf,
                    value: amazon_review_data,
                });
            }

            if (changed_fields.includes('amazon_address_url')) {
                // 更新 amazon_address 元字段（JSON 格式：{"text": "...", "url": "..."}）
                const amazon_address_json = JSON.stringify({
                    text: sku,
                    url: amazon_address_url,
                });

                metafields_to_update.push({
                    ...shopify_amazon_address,
                    value: amazon_address_json,
                });
            }

            if (changed_fields.includes('features_specs')) {
                // 更新 functions_and_specifications 元字段
                metafields_to_update.push({
                    ...shopify_features_specs,
                    value: amazon_features_specs,
                });
            }

            if (changed_fields.includes('content_imgs')) {
                // 先将 Amazon 图片上传到 Shopify，获取文件 GID
                const uploaded_gids = await shopify_admin_api.upload_images_to_shopify(amazon_content_imgs);
                // 更新 product_description 元字段（list.file_reference，存储 Shopify 文件 GID 数组）
                metafields_to_update.push({
                    ...shopify_content_imgs_mf,
                    value: JSON.stringify(uploaded_gids),
                });
            }

            if (changed_fields.includes('content_json')) {
                // 更新 product_description_assisted_rendering 元字段
                metafields_to_update.push({
                    ...shopify_content_json_mf,
                    value: amazon_content_json,
                });
            }

            if (metafields_to_update.length > 0) {
                updates.metafields = metafields_to_update;
            }

            // console.log('amazon_item', amazon_item);
            // console.log('shopify_product', shopify_product);
            // debugger;
            await this.apply_product_updates(
                shopify_product.product_id,
                shopify_product.variant_id,
                updates
            );

            // 验证并发布到对应市场 —— 因 Shopify 权限问题暂时禁用
            // await this.verify_market_publication(shopify_product.product_gid, amazon_item.site);

            return {
                sku,
                type: 'update',
                changed_fields,
                shopify_product_id: shopify_product.product_id,
                updates,
            };
        }
        catch (error) {
            const msg = LogOrErrorSet.get_instance().save_error(error);
            LogOrErrorSet.get_instance().push_log(
                `更新产品 ${sku} 失败: ${msg}`,
                { error: true, }
            );
            throw error;
        }
    }

    /**
     * 设置站点库存。
     *
     * 根据 Amazon 数据的 site 字段，将库存分配到对应的 Shopify 仓库。
     * us → US 仓库, ca → CA 仓库。
     *
     * @param variant_id - Shopify 变体 ID
     * @param site - Amazon 站点代码
     */
    private async set_site_inventory(variant_id: string, site?: string): Promise<void> {
        const target_site = (site || this.site).toLowerCase();
        const location_id = this.location_cache[target_site];

        if (!location_id) {
            LogOrErrorSet.get_instance().push_log(`未找到站点 ${target_site} 对应的仓库位置`, { error: true, });
            return;
        }

        try {
            // 通过变体查询获取 inventory_item_id
            const variant_data = await shopify_admin_api.get_data<{ data: { productVariant: { inventoryItem: { id: string } } } }>(`
                query($id: ID!) {
                    productVariant(id: $id) {
                        inventoryItem {
                            id
                        }
                    }
                }
            `, {
                id: `gid://shopify/ProductVariant/${variant_id}`,
            });

            const inv_item_gid = variant_data.data.productVariant.inventoryItem?.id;
            if (!inv_item_gid) {
                LogOrErrorSet.get_instance().push_log(`无法获取变体 ${variant_id} 的 inventory_item_id`, { error: true, });
                return;
            }

            const inv_item_id = inv_item_gid.replace(/^gid.*?(\d+)$/, '$1');

            // 设置库存为 100（默认值）
            await shopify_admin_api.set_inventory_level(inv_item_id, location_id, 100);
        }
        catch (error) {
            LogOrErrorSet.get_instance().push_log(
                `设置库存失败 (variant:${variant_id}, ${target_site}): ${LogOrErrorSet.get_instance().save_error(error)}`,
                { error: true, }
            );
        }
    }
}

/**
 * 同步结果类型。
 */
interface SyncResult {
    sku: string;
    type: 'add' | 'update' | 'skip' | 'archived' | 'reactivated' | 'error';
    changed_fields?: string[];
    error?: string;
    shopify_product_id?: string;
    updates?: unknown;
}

export type { SyncResult };
