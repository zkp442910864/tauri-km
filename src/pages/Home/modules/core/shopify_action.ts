import { get_real_dom_text, handle_number, log_error, LogOrErrorSet } from '@/utils';
import { fetch } from '@tauri-apps/plugin-http';
import { stringify } from 'qs';
import { parallel, retry } from 'radash';
import { IHtmlParseData, IOtherData, IShopifyData, IShopifyProductData, TParseData, TParseType, TThenData } from '../types/index.type';
import { shopify_admin_api } from '../shopify_admin_api';
import { GLOBAL_DATA } from '../global_data';

export class ShopifyAction {

    domain = GLOBAL_DATA.CURRENT_STORE.config.shopify_domain;
    collection_url = '/collections/all';
    product_url = '/products';
    fill_inventory = false;
    assign_skus: string[] = [];
    sku_data: IShopifyData[] = [];
    sku_map: Record<string, IShopifyData> = {};
    thenFn?: (data: TThenData) => void;
    catchFn?: (err: unknown) => void;
    logs: string[] = [];

    constructor(assign_skus: string[], fill_inventory = false) {
        this.assign_skus = assign_skus;
        this.fill_inventory = fill_inventory;
        void this.init();
    }

    async init() {
        LogOrErrorSet.get_instance().push_log('shopify数据处理开始', { title: true, });

        if (this.assign_skus.length) {
            this.handle_assign_skus();
        }
        else {
            // await this.fetch_all_sku(`${this.domain}${this.collection_url}`);
            await this.fetch_all_sku_v2();
        }
        await this.fetch_sku_detail(`${this.domain}${this.product_url}`);

        this.thenFn?.({ sku_data: this.sku_data, sku_map: this.sku_map, });
        LogOrErrorSet.get_instance().push_log(`shopify数据处理结束, 总条数${this.sku_data.length} \n ${LogOrErrorSet.get_instance().save_data(this.sku_data)}`, { title: true, });
    }

    push_sku(sku: string, variant_id?: string, sku_data = this.sku_data, sku_map = this.sku_map) {
        const key = sku.toLocaleUpperCase();
        if (!sku_map[key]) {
            const new_sku_item = { sku: key, variant_id, };
            sku_map[key] = new_sku_item;
            sku_data.push(new_sku_item);
            return true;
        }
        else {
            return false;
        }
    }

    handle_assign_skus() {
        this.assign_skus.forEach(sku => {
            this.push_sku(sku);
        });
    }

    /** 获取所有sku */
    async fetch_all_sku(url: string) {
        let start = true;
        let page = 1;

        LogOrErrorSet.get_instance().push_log('shopify分类处理', { title: true, is_fill_row: true, });

        while (start) {
            const fullUrl = `${url}?${stringify({ page, })}`;
            LogOrErrorSet.get_instance().push_log(`获取数据开始: ${fullUrl}`, { repeat: true, });

            try {
                // const res = await auto_reset_fetch(() => fetch(`${url}?${stringify({ page, })}`))();
                const res = await retry({ times: 3, delay: 1000, }, () => fetch(fullUrl));
                const html = await res.text();
                if (html.match(/No products found/i)) {
                    start = false;
                }
                else {
                    page++;
                    const domParser = new DOMParser();
                    const dom = domParser.parseFromString(html, 'text/html');
                    dom.querySelectorAll<HTMLLIElement>('#product-grid>li').forEach((item) => {
                        item.dataset.sku && this.push_sku(item.dataset.sku);
                    });
                }
                // LogOrErrorSet.get_instance().push_log(`获取数据完成: ${fullUrl}`, { repeat: true, });
            }
            catch (error) {
                console.log(error);
                start = false;
                this.catchFn?.(error);
                LogOrErrorSet.get_instance().push_log(`获取数据失败-中断: ${fullUrl} \n ${LogOrErrorSet.get_instance().save_error(error)}`, { repeat: true, error: true, });
                return;
            }
        }

        LogOrErrorSet.get_instance().push_log('shopify分类处理完成', { title: true, });

    }

    async fetch_all_sku_v2() {
        LogOrErrorSet.get_instance().push_log('shopify获取sku', { title: true, is_fill_row: true, });

        await LogOrErrorSet.get_instance().capture_error(async () => {
            const { data, } = await shopify_admin_api.get_all_product();
            data.forEach((item) => {
                this.push_sku(item.first_variant_sku, item.first_variant_id);
            });
        });

        LogOrErrorSet.get_instance().push_log('shopify获取sku完成', { title: true, });
    }

    /** 获取每个sku下的详情 */
    async fetch_sku_detail(url: string) {
        if (!this.sku_data.length) return;
        LogOrErrorSet.get_instance().push_log('shopify产品处理', { title: true, is_fill_row: true, });

        const skus = this.sku_data.map(ii => ii.sku);
        await parallel(3, skus, async (sku) => {
            const fullUrl = `${url}/${sku}`;

            try {
                LogOrErrorSet.get_instance().push_log(`获取数据开始: ${fullUrl}`, { repeat: true, });
                const res = await retry({ times: 3, delay: 1000, }, () => fetch(fullUrl));
                const html = await res.text();
                const domParser = new DOMParser();
                const dom = domParser.parseFromString(html, 'text/html');

                const info_json = dom.querySelector('#product-info-data')?.textContent;
                const description_json = dom.querySelector('#product-info-data')?.nextElementSibling?.textContent;
                if (info_json) {
                    const data = JSON.parse(info_json) as IShopifyProductData;
                    if (description_json) {
                        data.content_json = JSON.stringify(JSON.parse(description_json));
                    }
                    // this.sku_map[sku].detail = data;
                    [this.sku_map[sku].detail, this.sku_map[sku].detail_map,] = await this.convert_data(data);
                }
                LogOrErrorSet.get_instance().push_log(`获取数据完成: ${fullUrl}`, { repeat: true, is_fill_row: true, });
            }
            catch (error) {
                LogOrErrorSet.get_instance().push_log(`获取数据失败: ${fullUrl} \n ${LogOrErrorSet.get_instance().save_error(error)}`, { repeat: true, error: true, is_fill_row: true, });
            }
        });

        LogOrErrorSet.get_instance().push_log('shopify产品处理完成', { repeat: true, });
    }

    /** 把数据转成亚马逊的结构,为后续对比简化逻辑 */
    async convert_data(data: IShopifyProductData) {
        const new_data: TParseData[] = [];

        new_data.push(new IHtmlParseData('get_title', data.title));
        new_data.push(new IHtmlParseData('get_banner_imgs', data.banner_imgs));

        void LogOrErrorSet.get_instance().capture_error(() => {
            const price = handle_number(data.price.match(/Regular price\s+\$([\d.]+)\s+USD/)?.[1] ?? -1);
            const old_price = handle_number(data.price.match(/\$([\d.]+)\s+USD\s+Sale price\s+/)?.[1] ?? -1);

            if (price === -1) LogOrErrorSet.get_instance().push_log(`价格解析失败: ${data.sku}`, { error: true, is_fill_row: true, });

            new_data.push(new IHtmlParseData('get_price', { price, old_price, }));
        }, data);

        new_data.push(new IHtmlParseData('get_sku_model', data.sku_model || ''));
        new_data.push(new IHtmlParseData('get_relevance_tag', data.relevance_tag || ''));

        new_data.push(new IHtmlParseData('get_desc_text', await get_real_dom_text(data.desc_text || '')));
        new_data.push(new IHtmlParseData('get_detail', data.detail || ''));
        // new_data.push(new IHtmlParseData('get_features_specs', data.features_specs || ''));
        new_data.push(new IHtmlParseData('get_content_imgs', data.content_imgs || []));
        new_data.push(new IHtmlParseData('get_content_json', data.content_json || ''));

        new_data.push(new IHtmlParseData('amazon_address_url', data.amazon_address_url || ''));

        new_data.push(new IHtmlParseData('shopify_product_id', data.shopify_product_id));
        new_data.push(new IHtmlParseData('shopify_sku_id', data.shopify_sku_id));
        new_data.push(new IHtmlParseData('shopify_inventory', data.inventory));
        if (this.fill_inventory) {
            new_data.push(new IHtmlParseData('shopify_inventory_detail', await this.fetch_Inventory(data.shopify_sku_id!)));
        }

        return [
            new_data,
            new_data.reduce((map, item) => {
                map[item.type] = item;
                return map;
            }, {} as Record<TParseType, TParseData>),
        ] as [typeof new_data, Record<TParseType, TParseData>];
    }

    async fetch_Inventory(vid: number) {
        const result = await log_error.capture_error(async () => {
            const data: IOtherData = {};
            const inventory_data = await shopify_admin_api.get_inventory_detail(vid + '');
            data.inventory_total = inventory_data.inventory_quantity;
            inventory_data.data.forEach(({ name, quantity, }) => {
                switch (name) {
                    case 'US':
                        data.inventory_us = quantity;
                        break;
                    case 'CA':
                        data.inventory_ca = quantity;
                        break;
                }
            });
            return data;
        });


        return result;
    }

    /** 输出结果 */
    then(fn: typeof this.thenFn) {
        this.thenFn = fn;
    }

    catch(fn: typeof this.catchFn) {
        this.catchFn = fn;
    }
}


