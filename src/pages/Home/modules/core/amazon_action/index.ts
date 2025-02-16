import { LogOrErrorSet } from '@/utils';
import { core } from '@tauri-apps/api';
import { stringify } from 'qs';
import { alphabetical, parallel, retry, sleep } from 'radash';
import { TThenData, IAmazonData, IHtmlParseData, TParseData, TParseType } from '../../types/index.type';
import { get_model, get_detail_v2, get_title, get_banner_imgs, get_price, get_sku_model, get_desc_text, get_content_json, get_choice, get_review_data } from './utils';
import { GLOBAL_DATA } from '../../global_data';

export class AmazonAction {
    // https://www.amazon.com/stores/page/78D7D7E4-A104-40B0-8DC1-FB61BD2F16E5
    // ?language=en_US

    domain = GLOBAL_DATA.CURRENT_STORE.config.amazon_domain;
    collection_urls = GLOBAL_DATA.CURRENT_STORE.config.amazon_collection_urls;
    product_url = '/dp';
    fixed_params = {
        language: 'en_US',
    };
    thenFn?: (data: TThenData) => void;
    catchFn?: (err: unknown) => void;
    assign_skus: string[] = [];
    sku_data: IAmazonData[] = [];
    sku_map: Record<string, IAmazonData> = {};
    /** 重试次数 */
    retry_count = 3;

    constructor(assign_skus: string[]) {
        this.assign_skus = assign_skus;
        void this.init();
    }

    async init() {

        LogOrErrorSet.get_instance().push_log('亚马逊数据处理开始', { title: true, });

        if (this.assign_skus.length) {
            this.handle_assign_skus();
        }
        else {
            await this.fetch_all_sku(this.collection_urls.map(ii => `${this.domain}${ii}`));
        }
        await this.for_fetch_sku_detail(`${this.domain}${this.product_url}`);

        this.thenFn?.({ sku_data: this.sku_data, sku_map: this.sku_map, });
        LogOrErrorSet.get_instance().push_log(`亚马逊数据处理结束, 总条数${this.sku_data.length} \n ${LogOrErrorSet.get_instance().save_data(this.sku_data)}`, { title: true, });
    }

    push_sku(sku: string, sku_data = this.sku_data, sku_map = this.sku_map) {
        const key = sku.toLocaleUpperCase();
        if (!sku_map[key]) {
            const new_sku_item = { sku: key, };
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
    async fetch_all_sku(urls: string[]) {
        const sku_data: IAmazonData[] = [];
        const sku_map: typeof this.sku_map = {};
        LogOrErrorSet.get_instance().push_log('亚马逊分类处理', { title: true, is_fill_row: true, });

        for (const url of urls) {
            const fullUrl = `${url}${url.indexOf('?') > -1 ? '&' : '?'}${stringify({ ...this.fixed_params, })}`;
            LogOrErrorSet.get_instance().push_log(`获取数据开始: ${fullUrl}`, { repeat: true, is_fill_row: true, });

            try {
                const res = await retry({ times: this.retry_count, delay: 1000, }, () => core.invoke<string>('task_find_amazon_sku', { url: fullUrl, }));
                const json_data = JSON.parse(res) as ITauriResponse<string[]>;
                json_data.data?.forEach((str) => {
                    const match_data = str.match(/^amzn1.asin.(\w+)/i);
                    if (match_data) {
                        this.push_sku(match_data[1], sku_data, sku_map);
                    }
                    else {
                        LogOrErrorSet.get_instance().push_log(`正则匹配失败: ${str}`, { repeat: true, is_fill_row: true, error: true, });
                    }
                });
            }
            catch (error) {
                // console.log(error);
                this.catchFn?.(error);
                LogOrErrorSet.get_instance().push_log(`获取数据失败-中断: ${fullUrl} \n ${LogOrErrorSet.get_instance().save_error(error)}`, { repeat: true, error: true, });
                return;
            }
        }

        LogOrErrorSet.get_instance().push_log(`亚马逊分类处理完成,总条数${sku_data.length}`, { repeat: true, });

        this.sku_data = sku_data;
        this.sku_map = sku_map;
    }

    /** 获取每个sku下的详情 */
    async fetch_sku_detail(url: string, skus: string[]) {
        const variant_skus: string[] = [];

        await parallel(3, skus, async (sku) => {
            const fullUrl = `${url}/${sku}?${stringify({ ...this.fixed_params, })}`;

            try {
                LogOrErrorSet.get_instance().push_log(`获取数据开始: ${fullUrl}`, { repeat: true, });
                const fail_count = 0;
                const fn = async () => {

                    const res = await retry({ times: this.retry_count, delay: 1000, }, () => core.invoke<string>('task_amazon_product_fetch_html', { url: fullUrl, }));
                    const json_data = JSON.parse(res) as ITauriResponse<string>;
                    if (json_data.status === 0) {
                        LogOrErrorSet.get_instance().push_log(`可能遇到验证页面: ${fullUrl} \n ${LogOrErrorSet.get_instance().save_error(json_data)}`, { error: true, is_fill_row: true, });
                        return;
                    }

                    const html = json_data.data || '';
                    const domParser = new DOMParser();
                    const dom = domParser.parseFromString(html, 'text/html');
                    let inline_variant_skus = [] as string[];

                    // 好像会出现动态加载的情况,所以延迟下
                    await sleep(fail_count);

                    // 补充缺失变体sku
                    {
                        try {
                            const data = get_model(dom);
                            Object.keys(data).forEach((sku) => {
                                inline_variant_skus.push(sku);
                            });
                            inline_variant_skus = alphabetical(inline_variant_skus, ii => ii);
                            variant_skus.push(...inline_variant_skus);
                        }
                        catch (error) {
                            LogOrErrorSet.get_instance().push_log(`解析get_model失败: ${fullUrl} \n ${LogOrErrorSet.get_instance().save_error(error)}`, { error: true, is_fill_row: true, });
                        }
                    }

                    // 数据抓取
                    {
                        const parse_data: Exclude<IAmazonData['detail'], undefined> = [];
                        const [detail_model, detail_data,] = get_detail_v2(dom);
                        // 独立属性
                        parse_data.push(new IHtmlParseData('amazon_address_url', fullUrl));
                        parse_data.push(new IHtmlParseData('amazon_product_sku', sku));
                        parse_data.push(new IHtmlParseData('amazon_product_brand', 'CHONCHOW'));
                        parse_data.push(new IHtmlParseData('amazon_product_collections', ['Other',].join(',')));
                        // parse_data.push(new IHtmlParseData('amazon_product_brand', sku));

                        // 标题
                        parse_data.push(get_title(dom));
                        // 商品轮播图
                        const img_data = get_banner_imgs(dom);
                        parse_data.push(img_data);
                        parse_data.push(new IHtmlParseData('amazon_first_image', img_data.data[0] || ''));
                        // 商品价格
                        parse_data.push(get_price(dom));
                        // 商品型号
                        parse_data.push(get_sku_model(dom, sku, detail_model));
                        // 商品详情
                        // parse_data.push(get_detail(dom));
                        parse_data.push(detail_data);
                        // 商品描述文案
                        parse_data.push(await get_desc_text(dom));
                        // 商品最新评论
                        parse_data.push(await get_review_data(dom));
                        // 商品功能与规格
                        // parse_data.push(get_features_specs(dom));
                        // 商品详情内容(图 + 数据json)
                        parse_data.push(...await get_content_json(dom));
                        // sku关联
                        parse_data.push(new IHtmlParseData('get_relevance_tag', inline_variant_skus.length > 1 ? `关联:${inline_variant_skus.join('+')}` : ''));
                        parse_data.push(new IHtmlParseData('get_choice', +get_choice(dom)));

                        const error_data = parse_data.find(ii => !!ii.error);
                        // if (!!error_data && fail_count < this.retry_count - 1) {
                        //     fail_count++;
                        //     // console.error(error_data);
                        //     throw new Error('存在获取失败,进行重试');
                        // }
                        // else
                        if (error_data) {
                            const key = LogOrErrorSet.get_instance().save_error(error_data);
                            LogOrErrorSet.get_instance().push_log(`获取数据错误: \n ${fullUrl} \n ${key}`, { error: true, repeat: true, is_fill_row: true, });
                            // return false;
                        }

                        this.sku_map[sku].detail = parse_data;
                        this.sku_map[sku].detail_map = parse_data.reduce((map, item) => {
                            map[item.type] = item;
                            return map;
                        }, {} as Record<TParseType, TParseData>);
                    }

                    return true;
                };

                if (await retry({ times: this.retry_count, delay: 1000, }, fn)) {
                    LogOrErrorSet.get_instance().push_log(`获取数据完成: ${fullUrl}`, { repeat: true, is_fill_row: true, });
                }
            }
            catch (error) {
                LogOrErrorSet.get_instance().push_log(`获取数据失败: ${fullUrl} \n ${LogOrErrorSet.get_instance().save_error(error)}`, { repeat: true, error: true, is_fill_row: true, });
            }
        });

        return this.assign_skus.length ? [] : variant_skus;
        // return [];
        // return variant_skus;
    }

    /** 循环执行 fetch_sku_detail 的逻辑,因为分类页面存在 变体 不显示的情况 */
    async for_fetch_sku_detail(url: string) {
        if (!this.sku_data.length) return;

        LogOrErrorSet.get_instance().push_log('亚马逊产品处理', { title: true, is_fill_row: true, });

        let execute = true;
        let skus = this.sku_data.map(ii => ii.sku);

        while (execute) {
            if (skus.length) {
                const variant_skus = await this.fetch_sku_detail(url, skus);
                skus = [];
                variant_skus.forEach((sku) => {
                    this.push_sku(sku) && skus.push(sku);
                });
            }
            else {
                execute = false;
            }
        }

        LogOrErrorSet.get_instance().push_log('亚马逊产品处理完成', { repeat: true, });

    }


    /** 输出结果 */
    then(fn: typeof this.thenFn) {
        this.thenFn = fn;
    }

    catch(fn: typeof this.catchFn) {
        this.catchFn = fn;
    }
}
