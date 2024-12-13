import { handle_number, LogOrErrorSet } from '@/utils';
import { fetch } from '@tauri-apps/plugin-http';
import { stringify } from 'qs';
import { parallel, retry } from 'radash';
import { IHtmlParseData, IOtherData, IShopifyData, IShopifyProductData, TParseData, TParseType, TThenData } from './index.type';

export class ShopifyAction {

    domain = 'https://chonchow.com';
    collection_url = '/collections/all';
    product_url = '/products';
    sku_data: IShopifyData[] = [];
    sku_map: Record<string, IShopifyData> = {};
    thenFn?: (data: TThenData) => void;
    catchFn?: (err: unknown) => void;
    logs: string[] = [];

    constructor() {
        void this.init();
    }

    async init() {
        LogOrErrorSet.get_instance().push_log('shopify数据处理开始', { title: true, });

        // this.set_test_data();
        await this.fetch_all_sku(`${this.domain}${this.collection_url}`);
        await this.fetch_sku_detail(`${this.domain}${this.product_url}`);

        this.thenFn?.({ sku_data: this.sku_data, sku_map: this.sku_map, });
        LogOrErrorSet.get_instance().push_log(`shopify数据处理结束, 总条数${this.sku_data.length} \n ${LogOrErrorSet.get_instance().save_data(this.sku_data)}`, { title: true, });
    }

    set_test_data() {
        const data = { sku: 'B0CJXY9Z5D', };
        this.sku_data.push(data);
        this.sku_map[data.sku] = data;
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
                        if (item.dataset.sku) {
                            const key = item.dataset.sku.toLocaleUpperCase();
                            const data = { sku: key, };
                            this.sku_data.push(data);
                            this.sku_map[key] = data;
                        }
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
                    [this.sku_map[sku].detail, this.sku_map[sku].detail_map,] = this.convert_data(data);
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
    convert_data(data: IShopifyProductData) {
        const new_data: TParseData[] = [];

        new_data.push(new IHtmlParseData('get_title', data.title));
        new_data.push(new IHtmlParseData('get_banner_imgs', data.banner_imgs));

        const price_data = LogOrErrorSet.get_instance().capture_error(() => {
            const price = handle_number(data.price.match(/Regular price\s+\$([\d.]+)\s+USD/)?.[1] ?? -1);
            const old_price = handle_number(data.price.match(/\$([\d.]+)\s+USD\s+Sale price\s+/)?.[1] ?? -1);

            if (price === -1) LogOrErrorSet.get_instance().push_log(`价格解析失败: ${data.sku}`, { error: true, is_fill_row: true, });

            return { price, old_price, };
        });

        new_data.push(
            price_data.success
                ? new IHtmlParseData('get_price', price_data.data)
                : new IHtmlParseData('get_price', null, price_data.msg ?? `解析失败: ${data.sku}`, price_data.data)
        );

        new_data.push(new IHtmlParseData('get_sku_model', data.sku_model || ''));
        new_data.push(new IHtmlParseData('get_detail', data.detail || ''));
        new_data.push(new IHtmlParseData('get_desc_text', data.desc_text || ''));
        new_data.push(new IHtmlParseData('get_features_specs', data.features_specs || ''));
        new_data.push(new IHtmlParseData('get_content_imgs', data.content_imgs || []));
        new_data.push(new IHtmlParseData('get_content_json', data.content_json || ''));

        new_data.push(new IHtmlParseData('amazon_address_url', data.amazon_address_url || ''));

        return [
            new_data,
            new_data.reduce((map, item) => {
                map[item.type] = item;
                return map;
            }, {} as Record<TParseType, TParseData>),
        ] as [typeof new_data, Record<TParseType, TParseData>];
    }

    /** 输出结果 */
    then(fn: typeof this.thenFn) {
        this.thenFn = fn;
    }

    catch(fn: typeof this.catchFn) {
        this.catchFn = fn;
    }
}

