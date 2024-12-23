import { alphabetical, crush, omit } from 'radash';
import { IAmazonData, IDetailContentRoot, IOtherData, TParseTypeMsg, TThenData } from '../types/index.type';
import { LogOrErrorSet } from '@/utils';
import { image } from '@tauri-apps/api';
import { invoke } from '@tauri-apps/api/core';

export class Compare {
    amazon_data: TThenData;
    shopify_data: TThenData;

    constructor(amazon_data: typeof this.amazon_data, shopify_data: typeof this.shopify_data) {
        this.amazon_data = amazon_data;
        this.shopify_data = shopify_data;
    }

    async start() {
        LogOrErrorSet.get_instance().push_log('开始进行数据比对', { title: true, });

        const arr: CompareData[] = [];
        /** 防止被使用过的sku,重复使用 */
        const use_skus: string[] = [];
        const add_data = await this.each_add_data(use_skus);
        const remove_data = this.each_remove_data(use_skus);
        const update_data = await this.each_update_data(use_skus);

        add_data.length && arr.push(...add_data);
        remove_data.length && arr.push(...remove_data);
        update_data.length && arr.push(...update_data);

        LogOrErrorSet.get_instance().push_log('执行完成', { repeat: true, });

        return arr;
    }

    /** 遍历出新增数据 (以亚马逊sku为主进行遍历,匹配shopify,匹配不上的就是新增) */
    each_add_data = async (use_skus: string[]) => {
        LogOrErrorSet.get_instance().push_log('遍历新增数据', { title: true, });
        const arr = [];
        const new_sku_data = this.amazon_data.sku_data.filter(item => {
            // 被使用过的sku,不再使用
            if (use_skus.indexOf(item.sku) > -1) return false;

            if (!this.shopify_data.sku_map[item.sku]) {
                use_skus.push(item.sku);
                return true;
            }
            else {
                return false;
            }
        });

        for (const item of new_sku_data) {
            await this.handle_add_data(item);
            arr.push(new CompareData('amazon', 'add', item));
        }

        return arr;
    };

    /**
     * 遍历出删除数据 (以shopify的sku为主进行遍历,匹配亚马逊sku,匹配不到的就是删除)
     *  增加规则
     *      1. 如果亚马逊的sku价格解析失败,归删除
     */
    each_remove_data = (use_skus: string[]) => {
        LogOrErrorSet.get_instance().push_log('遍历删除数据', { title: true, });

        const remove_sku_data = this.shopify_data.sku_data.filter(ii => {
            const amazon_item = this.amazon_data.sku_map[ii.sku];
            // 被使用过的sku,不再使用
            if (use_skus.indexOf(ii.sku) > -1) return false;

            if (
                !amazon_item ||
                !amazon_item.detail_map?.get_price ||
                amazon_item.detail_map?.get_price.error ||
                !amazon_item.detail_map?.get_price.data
            ) {
                use_skus.push(ii.sku);
                return true;
            }
            return false;
        });
        return remove_sku_data.map(ii => new CompareData('shopify', 'remove', ii));
    };

    /** 遍历出修改数据 (以shopify的sku为主进行遍历) */
    each_update_data = (use_skus: string[]) => {
        LogOrErrorSet.get_instance().push_log('遍历更新数据', { is_fill_row: true, title: true, });
        const arr: CompareData<IAmazonData>[] = [];
        // LogOrErrorSet.get_instance().push_log('对比', { is_fill_row: true, });

        return new Promise<typeof arr>((rel) => {
            void (async () => {
                for (const shopify_item of this.shopify_data.sku_data) {

                    LogOrErrorSet.get_instance().push_log(`对比: ${shopify_item.sku}`, { repeat: true, });

                    const amazon_item = this.amazon_data.sku_map[shopify_item.sku];

                    // 被使用过的sku,不进行对比
                    if (use_skus.indexOf(shopify_item.sku) > -1) continue;
                    // 数据不完整,不进行对比
                    if (!amazon_item) continue;
                    if (!amazon_item.detail || !amazon_item.detail_map) {
                        // arr.push(new CompareData('amazon', 'warn', amazon_item).as_explain('对比逻辑: 详情可能是获取失败了, 请检查采集逻辑'));
                        arr.push(new CompareData('shopify', 'remove', shopify_item));
                        continue;
                    }
                    if (!shopify_item.detail) {
                        // arr.push(new CompareData('shopify', 'warn', shopify_item).as_explain('对比逻辑: 详情可能是获取失败了, 请检查采集逻辑'));
                        await this.handle_add_data(amazon_item);
                        arr.push(new CompareData('amazon', 'add', amazon_item));
                        continue;
                    }

                    // 比较逻辑
                    try {
                        const check_data = await this.primary_logic(shopify_item, amazon_item);

                        if (check_data.is_update) {
                            arr.push(new CompareData('shopify', 'update', shopify_item).as_update_data(amazon_item).as_explain(check_data.msgs.join()));
                        }
                        else {
                            arr.push(new CompareData('shopify', 'fit', shopify_item).as_update_data(amazon_item).as_explain(check_data.msgs.join()));
                        }
                    }
                    catch (error) {
                        const msg = `对比出错: ${shopify_item.sku},${LogOrErrorSet.get_instance().save_error(error)}`;
                        LogOrErrorSet.get_instance().push_log(msg, { repeat: true, error: true, });
                        arr.push(new CompareData('shopify', 'warn', shopify_item).as_explain(msg));
                        continue;
                    }
                }

                rel(arr);
            })();
        });
    };

    /** 比对逻辑 */
    async primary_logic(shopify: IAmazonData, amazon: IAmazonData) {
        let is_update = false;
        const msgs: TParseTypeMsg[] = [];

        for (const shopify_item of shopify.detail!) {
            const amazon_item = amazon.detail_map![shopify_item.type];

            if (shopify_item.type === 'get_title') {
                if (shopify_item.data !== amazon_item.data) {
                    is_update = true;
                    msgs.push('get_title');
                }
            }
            else if (shopify_item.type === 'amazon_address_url') {
                const shopify_val = shopify_item.data as string;
                if (shopify_val !== amazon_item.data && !shopify_val.match(new RegExp(amazon.sku, 'i'))) {
                    is_update = true;
                    msgs.push('amazon_address_url');
                }
            }
            else if (shopify_item.type === 'get_banner_imgs') {
                const shopify_val = shopify_item.data as string[];
                const amazon_val = amazon_item.data as string[];
                if (shopify_val.length !== amazon_val.length) {
                    is_update = true;
                    msgs.push('get_banner_imgs');
                    await this.download_imgs(amazon.sku, 'banner', amazon_val);
                }
                else if (await this.compare_imgs(shopify.sku, 'banner', shopify_val, amazon_val)) {
                    is_update = true;
                    msgs.push('get_banner_imgs');
                }
            }
            else if (shopify_item.type === 'get_price') {
                const shopify_val = shopify_item.data as IOtherData;
                // 抓取数据出错了,导致对象有了,值没有
                const amazon_val = (amazon_item?.data || {}) as IOtherData;
                if (!amazon_item) {
                    is_update = true;
                    msgs.push('get_price.no_price');
                }
                else if (shopify_val.price !== amazon_val.price || shopify_val.old_price !== amazon_val.old_price) {
                    is_update = true;
                    msgs.push('get_price');
                }
            }
            else if (shopify_item.type === 'get_sku_model') {
                const shopify_val = shopify_item.data as string;
                const amazon_val = amazon_item.data as string;
                if (shopify_val !== amazon_val) {
                    is_update = true;
                    msgs.push('get_sku_model');
                }
            }
            else if (shopify_item.type === 'get_detail') {
                const shopify_val = shopify_item.data as string;
                const amazon_val = amazon_item.data as string;

                if (shopify_val !== amazon_val) {
                    is_update = true;
                    msgs.push('get_detail');
                }
            }
            else if (shopify_item.type === 'get_desc_text') {
                const shopify_val = shopify_item.data as string;
                // 抓取数据出错了,导致对象有了,值没有
                const amazon_val = (amazon_item.data || {}) as IOtherData;
                if (shopify_val !== amazon_val.text) {
                    is_update = true;
                    msgs.push('get_desc_text');
                }
            }
            else if (shopify_item.type === 'get_features_specs') {
                const shopify_val = shopify_item.data as string;
                const amazon_val = amazon_item.data as string;

                if (shopify_val !== amazon_val) {
                    is_update = true;
                    msgs.push('get_features_specs');
                }
            }
            else if (shopify_item.type === 'get_content_imgs') {
                const shopify_val = shopify_item.data as string[];
                const amazon_val = amazon_item.data as string[];
                if (shopify_val.length !== amazon_val.length) {
                    is_update = true;
                    msgs.push('get_content_imgs');
                    await this.download_imgs(amazon.sku, 'desc', amazon_val);
                }
                else if (await this.compare_imgs(shopify.sku, 'desc', shopify_val, amazon_val)) {
                    is_update = true;
                    msgs.push('get_content_imgs');
                }
            }
            else if (shopify_item.type === 'get_content_json') {
                try {
                    const shopify_json_val = JSON.parse(shopify_item.data as string) as IDetailContentRoot;
                    const amazon_json_val = JSON.parse(amazon_item.data as string) as IDetailContentRoot;
                    // amazon_json_val.img_urls

                    if (this.sort_json(shopify_json_val) !== this.sort_json(amazon_json_val)) {
                        is_update = true;
                        msgs.push('get_content_json');
                    }
                }
                catch (error) {
                    LogOrErrorSet.get_instance().push_log(`json序列化失败: ${LogOrErrorSet.get_instance().save_error({ shopify_item, amazon_item, error, })}`, { error: true, is_fill_row: true, });
                    is_update = true;
                    msgs.push('get_content_json.error');
                }
            }
            else if (shopify_item.type === 'get_relevance_tag') {
                const shopify_val = shopify_item.data as string;
                const amazon_val = amazon_item.data as string;

                if (shopify_val !== amazon_val) {
                    is_update = true;
                    msgs.push('get_relevance_tag');
                }
            }
        }

        return { is_update, msgs, };
    }

    sort_json<T extends object>(data: T) {
        const crush_data = crush(data) as Record<string, unknown>;
        const keys = alphabetical(Object.keys(crush_data), ii => ii);
        const new_data = keys.reduce((map, key) => {
            map[key] = crush_data[key];
            return map;
        }, {} as Record<string, unknown>);

        return JSON.stringify(new_data);
    }

    async handle_add_data(item: IAmazonData) {
        if (item.detail_map?.get_banner_imgs) {
            await this.download_imgs(item.sku, 'banner', item.detail_map.get_banner_imgs.data as string[]);
        }
        if (item.detail_map?.get_content_imgs) {
            await this.download_imgs(item.sku, 'desc', item.detail_map.get_content_imgs.data as string[]);
        }
    }

    /** 图片内容对比 */
    async compare_imgs(sku: string, folder_type: 'banner' | 'desc', shopify_urls: string[], amazon_urls: string[]) {
        if (!shopify_urls.length && !amazon_urls.length) return false;
        // const res = await invoke<string>('task_amazon_images_diff_v2', {
        //     sku,
        //     folderType: folder_type,
        //     shopifyUrls: shopify_urls.map(ii => ii.replace('//', 'https://')),
        //     amazonUrls: amazon_urls,
        // });
        // const json = JSON.parse(res) as ITauriResponse<boolean>;
        // return json.data;
        return Promise.resolve(false);
    }

    /** 图片下载 */
    async download_imgs(sku: string, folder_type: 'banner' | 'desc', urls: string[]) {
        if (!urls.length) return true;
        const res = await invoke<string>('task_download_imgs', {
            sku,
            folderType: folder_type,
            urls,
        });
        const json = JSON.parse(res) as ITauriResponse<null>;
        return json.status === 1;
    }
}



export class CompareData<T = IAmazonData> {
    type: 'add' | 'update' | 'remove' | 'warn' | 'fit';
    data_type: 'shopify' | 'amazon';
    data: T;
    /** update 的时候存入的 */
    update_data?: T;
    /** 补充说明 */
    explain?: string;

    constructor(data_type: typeof this.data_type, type: typeof this.type, data: typeof this.data) {
        this.data_type = data_type;
        this.type = type;
        this.data = data;
    }

    as_update_data(update_data: typeof this.update_data) {
        this.update_data = update_data;
        return this;
    }

    as_explain(explain: typeof this.explain) {
        this.explain = explain;
        return this;
    }
}