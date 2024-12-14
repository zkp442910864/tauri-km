import { alphabetical, crush, omit } from 'radash';
import { IAmazonData, IDetailContentRoot, IOtherData, TThenData } from './index.type';
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
        const add_data = this.each_add_data();
        const remove_data = this.each_remove_data();
        const update_data = await this.each_update_data();

        add_data.length && arr.push(...add_data);
        remove_data.length && arr.push(...remove_data);
        update_data.length && arr.push(...update_data);

        LogOrErrorSet.get_instance().push_log('执行完成', { repeat: true, });

        return arr;
    }

    /** 遍历出新增数据 (以亚马逊sku为主进行遍历,匹配shopify,匹配不上的就是新增) */
    each_add_data = () => {
        LogOrErrorSet.get_instance().push_log('遍历新增数据', { title: true, });

        const new_sku_data = this.amazon_data.sku_data.filter(ii => !this.shopify_data.sku_map[ii.sku]);
        return new_sku_data.map(ii => new CompareData('amazon', 'add', ii));
    };

    /** 遍历出删除数据 (以shopify的sku为主进行遍历,匹配亚马逊sku,匹配不到的就是删除) */
    each_remove_data = () => {
        LogOrErrorSet.get_instance().push_log('遍历删除数据', { title: true, });

        const remove_sku_data = this.shopify_data.sku_data.filter(ii => !this.amazon_data.sku_map[ii.sku]);
        return remove_sku_data.map(ii => new CompareData('shopify', 'remove', ii));
    };

    /** 遍历出修改数据 (以shopify的sku为主进行遍历) */
    each_update_data = () => {
        LogOrErrorSet.get_instance().push_log('遍历更新数据', { is_fill_row: true, title: true, });
        const arr: CompareData<IAmazonData>[] = [];
        // LogOrErrorSet.get_instance().push_log('对比', { is_fill_row: true, });

        return new Promise<typeof arr>((rel) => {
            void (async () => {
                for (const shopify_item of this.shopify_data.sku_data) {

                    LogOrErrorSet.get_instance().push_log(`对比: ${shopify_item.sku}`, { repeat: true, });

                    const amazon_item = this.amazon_data.sku_map[shopify_item.sku];
                    if (!amazon_item) continue;
                    if (!amazon_item.detail || !amazon_item.detail_map) {
                        arr.push(new CompareData('amazon', 'warn', amazon_item).as_explain('对比逻辑: 详情可能是获取失败了, 请检查采集逻辑'));
                        continue;
                    }
                    if (!shopify_item.detail) {
                        arr.push(new CompareData('shopify', 'warn', shopify_item).as_explain('对比逻辑: 详情可能是获取失败了, 请检查采集逻辑'));
                        continue;
                    }

                    // 比较逻辑
                    try {
                        const check_data = await this.primary_logic(shopify_item, amazon_item);

                        if (check_data.is_update) {
                            arr.push(new CompareData('shopify', 'update', shopify_item).as_update_data(amazon_item).as_explain(check_data.msgs.join()));
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
        const msgs: string[] = [];

        for (const shopify_item of shopify.detail!) {
            const amazon_item = amazon.detail_map![shopify_item.type];

            if (shopify_item.type === 'get_title') {
                if (shopify_item.data !== amazon_item.data) {
                    is_update = true;
                    msgs.push('title');
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
                    msgs.push('banner_imgs');
                    await this.download_imgs(amazon.sku, 'banner', amazon_val);
                }
                else if (await this.compare_imgs(shopify.sku, 'banner', shopify_val, amazon_val)) {
                    is_update = true;
                    msgs.push('content_json.2');
                }
            }
            else if (shopify_item.type === 'get_price') {
                const shopify_val = shopify_item.data as IOtherData;
                // 抓取数据出错了,导致对象有了,值没有
                const amazon_val = (amazon_item.data || {}) as IOtherData;

                if (shopify_val.price !== amazon_val.price || shopify_val.old_price !== amazon_val.old_price) {
                    is_update = true;
                    msgs.push('price');
                }
            }
            else if (shopify_item.type === 'get_sku_model') {
                const shopify_val = shopify_item.data as string;
                const amazon_val = amazon_item.data as string;
                if (shopify_val.length !== amazon_val.length) {
                    is_update = true;
                    msgs.push('sku_model');
                }
            }
            else if (shopify_item.type === 'get_detail') {
                const shopify_val = shopify_item.data as string;
                const amazon_val = amazon_item.data as string;

                if (shopify_val !== amazon_val) {
                    is_update = true;
                    msgs.push('detail');
                }
            }
            else if (shopify_item.type === 'get_desc_text') {
                const shopify_val = shopify_item.data as string;
                // 抓取数据出错了,导致对象有了,值没有
                const amazon_val = (amazon_item.data || {}) as IOtherData;
                if (shopify_val !== amazon_val.text) {
                    is_update = true;
                    msgs.push('desc_text');
                }
            }
            else if (shopify_item.type === 'get_features_specs') {
                const shopify_val = shopify_item.data as string;
                const amazon_val = amazon_item.data as string;

                if (shopify_val !== amazon_val) {
                    is_update = true;
                    msgs.push('features_specs');
                }
            }
            else if (shopify_item.type === 'get_content_json') {
                try {
                    const shopify_json_val = JSON.parse(shopify_item.data as string) as Record<string, unknown>;
                    const amazon_json_val = JSON.parse(amazon_item.data as string) as IDetailContentRoot;
                    const shopify_imgs = shopify.detail_map!.get_content_imgs.data as string[];
                    const amazon_imgs = amazon_json_val.img_urls;
                    // amazon_json_val.img_urls

                    if (shopify_imgs.length !== amazon_imgs.length) {
                        is_update = true;
                        msgs.push('content_json.1.img_content');
                        await this.download_imgs(amazon.sku, 'desc', amazon_imgs);
                    }
                    else if (await this.compare_imgs(shopify.sku, 'desc', shopify_imgs, amazon_imgs)) {
                        is_update = true;
                        msgs.push('content_json.2.img_content');
                    }

                    if (this.sort_json(shopify_json_val) !== this.sort_json(omit(amazon_json_val, ['img_urls',]) as unknown as Record<string, unknown>)) {
                        console.log(this.sort_json(shopify_json_val));
                        console.log(this.sort_json(omit(amazon_json_val, ['img_urls',])));

                        is_update = true;
                        msgs.push('content_json');
                    }
                }
                catch (error) {
                    LogOrErrorSet.get_instance().push_log(`json序列化失败: ${LogOrErrorSet.get_instance().save_data(error)}`, { error: true, is_fill_row: true, });
                    is_update = true;
                    msgs.push('content_json.4');
                }
            }
        }

        return { is_update, msgs, };
    }

    sort_json<T extends Record<string, unknown>>(data: T) {
        const crush_data = crush(data) as T;
        const keys = alphabetical(Object.keys(crush_data), ii => ii);
        const new_data = keys.reduce((map, key) => {
            map[key] = crush_data[key];
            return map;
        }, {} as Record<string, unknown>);

        return JSON.stringify(new_data);
    }

    /** TODO: 图片内容对比 */
    async compare_imgs(sku: string, folder_type: 'banner' | 'desc', shopify_urls: string[], amazon_urls: string[]) {
        // const res = await invoke<string>('task_images_diff', {
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
    type: 'add' | 'update' | 'remove' | 'warn';
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