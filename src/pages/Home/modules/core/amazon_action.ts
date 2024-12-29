import { get_real_dom_text, handle_number, LogOrErrorSet } from '@/utils';
import { core } from '@tauri-apps/api';
import { stringify } from 'qs';
import { alphabetical, parallel, retry, sleep } from 'radash';
import { TThenData, IAmazonData, IHtmlParseData, IDetailContentRoot, IDetailContentData, TParseData, TParseType } from '../types/index.type';

export class AmazonAction {
    // https://www.amazon.com/stores/page/78D7D7E4-A104-40B0-8DC1-FB61BD2F16E5
    // ?language=en_US

    domain: string;
    collection_urls: string[];
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

    constructor(domain: string, collection_urls: string[], assign_skus: string[]) {
        this.domain = domain;
        this.collection_urls = collection_urls;
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

        const get_model = (dom: Document) => {
            return JSON.parse(dom.documentElement.outerHTML.match(/"dimensionValuesDisplayData"\s+?:(.*),\n/)?.[1] ?? '{}') as Record<string, string[]>;
        };

        const get_title = (dom: Document) => {
            try {
                return new IHtmlParseData('get_title', (dom.querySelector('#productTitle') as HTMLElement)?.innerText.trim());
            }
            catch (error) {
                return new IHtmlParseData('get_title', null, '解析失败', error);
            }
        };

        const amazon_choice = (dom: Document) => {
            const text = (dom.querySelector<HTMLDivElement>('#acBadge_feature_div')?.innerText || '').toLocaleLowerCase();
            return new IHtmlParseData('amazon_choice', text.indexOf('choice') > -1);
        };

        const get_banner_imgs = (dom: Document) => {
            try {
                const js_str = dom.querySelector('#imageBlock+script')?.textContent ?? '';
                const data = eval(
                    js_str.replace('P.when(\'A\').register("ImageBlockATF",', '(')
                        .replace(' A.trigger(\'P.AboveTheFold\');', '')
                        .replace('return data;\n});', 'return data;\n})();')
                        .replace('A.$.parseJSON', 'JSON.parse')
                        .trim()
                ) as {colorImages: {initial: {hiRes?: string, large: string}[]}};
                // console.log(data);
                return new IHtmlParseData('get_banner_imgs', data.colorImages.initial.map(ii => ii.hiRes || ii.large));
            }
            catch (error) {
                // console.error(error);
                return new IHtmlParseData('get_banner_imgs', [], 'get_banner_imgs 解析失败', error);

            }
        };

        const get_price = (dom: Document) => {
            let price = -1;
            let old_price = -1;
            dom.querySelectorAll<HTMLSpanElement>('#apex_desktop .aok-offscreen')?.forEach((item, index) => {
                if (index === 0) {
                    price = handle_number(item.innerText.trim().match(/\$([\d.]+)\s?/)?.[1] ?? -1);
                }
                else if (index === 1) {
                    old_price = handle_number(item.innerText.trim().match(/\$([\d.]+)\s?/)?.[1] ?? -1);
                }
            });

            // if (price === -1) {
            //     return new IHtmlParseData('get_price', null, '解析失败', new Error('解析失败'));
            // }

            return new IHtmlParseData('get_price', price === -1 ? null : { price, old_price, });
        };

        const get_sku_model = (dom: Document, sku: string, detail_model: string) => {
            try {
                const data = JSON.parse(dom.documentElement.outerHTML.match(/"dimensionValuesDisplayData"\s+?:(.*),\n/)?.[1] ?? '{}') as Record<string, string[]>;
                return new IHtmlParseData('get_sku_model', `${detail_model}&&&&${data[sku].join().replaceAll(',', ' ')}`);
            }
            catch (error) {
                return new IHtmlParseData('get_sku_model', `${detail_model}&&&&no model`);
                // return new IHtmlParseData('get_sku_model', null, '解析失败', error);
            }
        };

        const get_desc_text = async (dom: Document) => {
            try {
                const el = dom.querySelector('#feature-bullets>ul');
                const html = el?.outerHTML || '';
                const text = await get_real_dom_text(html);
                return new IHtmlParseData('get_desc_text', { html, text: text, });
            }
            catch (error) {
                return new IHtmlParseData('get_desc_text', null, '解析失败', error);
            }
        };

        const get_detail = (dom: Document) => {
            try {
                const node_list = dom.querySelectorAll('#productOverview_feature_div tr') ?? [];
                const str = [...node_list,].map((tr) => {
                    const row = tr.children as unknown as HTMLTableCellElement[];
                    const title = row[0].querySelector('span')!.innerText.trim();
                    const text =
                        (row[1].querySelector('span.a-truncate-full') as HTMLSpanElement)?.innerText.trim()
                        || row[1].querySelector('span')!.innerText.trim();
                    return `${title}:${text}`;
                }).join('\n');

                return new IHtmlParseData('get_detail', str);
            }
            catch (error) {
                return new IHtmlParseData('get_detail', null, '解析失败', error);
            }
        };

        const get_detail_v2 = (dom: Document) => {
            let detail_model = '';
            try {
                const data: Array<{title: string, value: string}> = [];
                const cacheSet = new Set<string>();
                const blacklist = [
                    'ASIN'.toLocaleLowerCase(),
                    'Best Sellers Rank'.toLocaleLowerCase(),
                    'Customer Reviews'.toLocaleLowerCase(),
                ];

                const push_val = (title: string, text: string) => {
                    if (!title || !text) return;
                    if (!cacheSet.has(title.toLocaleLowerCase())) {
                        data.push({ title, value: text, });
                        cacheSet.add(title.toLocaleLowerCase());
                        if (title.toLocaleLowerCase() === 'Item model number'.toLocaleLowerCase()) {
                            detail_model = text;
                        }
                    }
                };

                dom.querySelectorAll('#productOverview_feature_div tr.a-spacing-small')?.forEach((tr) => {
                    if (tr.querySelector('span.a-truncate-full')) {
                        const row = tr.children as unknown as HTMLTableCellElement[];
                        const title = row[0].querySelector('span')!.innerText.trim();
                        const text =
                            (row[1].querySelector('span.a-truncate-full') as HTMLSpanElement)?.innerText.trim()
                            || row[1].querySelector('span')!.innerText.trim();

                        push_val(title, text);
                    }
                    else {
                        const [title, text,] = (tr as HTMLTableCellElement).innerText.trim().split(/\s{4,}/);
                        push_val(title, text);
                    }
                });

                dom.querySelectorAll('#productOverview_feature_div #glance_icons_div tr:not([class])')?.forEach((tr) => {
                    const [title, text,] = (tr as HTMLTableCellElement).innerText.trim().split(/\s{4,}/);
                    push_val(title, text);
                });

                dom.querySelectorAll('#prodDetails table tr')?.forEach((tr) => {
                    const [title, text,] = (tr as HTMLTableCellElement).innerText.trim().split(/\s{4,}/);
                    if (blacklist.includes(title.toLocaleLowerCase())) return;
                    push_val(title, text);
                });

                return [detail_model, new IHtmlParseData('get_detail', data.map(ii => `${ii.title}:${ii.value}`).join('\n')),] as [string, IHtmlParseData<string>];
            }
            catch (error) {
                return [detail_model, new IHtmlParseData('get_detail', null, '解析失败', error),] as [string, IHtmlParseData<null>];
            }
        };

        const get_features_specs = (dom: Document) => {
            // TODO:需要一个补偿措施 Features & Specs

            const target_title_el = [...dom.querySelectorAll<HTMLSpanElement>('span.a-expander-prompt'),].find(ii => ii.innerText.trim() === 'Features & Specs');
            // console.log(target_title_el);
            if (!target_title_el) {
                const msg = '获取功能与规格失败: target_title_el';
                return new IHtmlParseData('get_features_specs', null, msg, new Error(msg));
            }

            const target_box = target_title_el?.parentElement?.parentElement?.parentElement;
            if (!target_box) {
                const msg = '获取功能与规格失败: target_box';
                return new IHtmlParseData('get_features_specs', null, msg, new Error(msg));
            }

            const node_list = target_box.querySelectorAll('tr') || [];
            const str = [...node_list,].map((tr) => {
                const row = tr.children as unknown as HTMLTableCellElement[];
                return `${row[0].innerText.trim()}:${row[1].innerText.trim()}`;
            }).join('\n');

            return new IHtmlParseData('get_features_specs', str);
            // try {
            //     const node_list = target_box.querySelector('#productDetails_expanderTables_depthLeftSections div:first-child')?.querySelectorAll('tr') || [];
            //     const str = [...node_list,].map((tr) => {
            //         const row = tr.children as unknown as HTMLTableCellElement[];
            //         return `${row[0].innerText.trim()}:${row[1].innerText.trim()}`;
            //     }).join('\n');
            //     return new IHtmlParseData('get_desc_text', str);
            // }
            // catch (error) {
            //     const node_list = target_box.querySelectorAll('tr') || [];
            //     const str = [...node_list,].map((tr) => {
            //         const row = tr.children as unknown as HTMLTableCellElement[];
            //         return `${row[0].innerText.trim()}:${row[1].innerText.trim()}`;
            //     }).join('\n');
            //     return new IHtmlParseData('get_desc_text', str);
            // }
        };

        const get_content_json = async (dom: Document) => {
            const img_urls: string[] = [];
            const data: IDetailContentRoot = {
                layout: 'style2',
                config: [],
            };

            const pushImg = (node: HTMLImageElement, arr = data.config) => {
                img_urls.push(node.dataset.src ?? node.src);
                arr.push({
                    type: 'img',
                    alt: node.alt,
                });
            };

            const pushTitle = async (node: HTMLDivElement, arr = data.config) => {
                arr.push({
                    type: 'title',
                    value: await get_real_dom_text(node.outerHTML),
                });
            };

            const pushText = async (node: HTMLDivElement, arr = data.config, style?: string) => {
                if (!node.innerText.trim()) return;
                arr.push({
                    type: 'text',
                    value: await get_real_dom_text(node.outerHTML),
                    style,
                });
            };

            const pushRow = (inline_data: IDetailContentData[], arr = data.config, style?: string) => {
                arr.push({
                    type: 'row',
                    value: inline_data,
                    style,
                });
            };

            const pushColumns = (inline_data: IDetailContentData[], arr = data.config) => {
                arr.push({
                    type: 'columns',
                    value: inline_data,
                });
            };

            const each = async (nodeArr: NodeListOf<Element> | Element[], arr = data.config) => {
                for (const item of nodeArr) {
                    if (!item) return;
                    try {

                        if (
                            item.nodeName === '#text'
                            || item.nodeName === '#comment'
                            || item.nodeName === 'NOSCRIPT'
                            || item.classList.contains('apm-tablemodule-table')
                        ) {
                            // 不执行
                        }
                        // 识别行
                        else if (
                            item.classList.contains('apm-hovermodule-slides')
                        ) {
                            const row: IDetailContentData[] = [];
                            await each([...item.children,], row);
                            row.length && pushRow(row, arr);
                        }
                        else if (item.classList.contains('apm-floatleft') && item.classList.contains('apm-wrap')) {
                            const row: IDetailContentData[] = [];
                            item.querySelector('.apm-leftimage')
                                && await each([item.querySelector('.apm-leftimage')!,], row);
                            item.querySelector('.apm-centerthirdcol')
                                && await each([item.querySelector('.apm-centerthirdcol')!,], row);
                            item.querySelector('.apm-rightthirdcol')
                                && await each([item.querySelector('.apm-rightthirdcol')!,], row);

                            row.length && pushRow(row, arr);
                        }
                        else if (item.classList.contains('apm-sidemodule') && item.classList.contains('apm-spacing')) {
                            const row: IDetailContentData[] = [];
                            item.querySelector('.apm-sidemodule-textleft')
                                && await each([item.querySelector('.apm-sidemodule-textleft')!,], row);
                            item.querySelector('.apm-sidemodule-imageright')
                                && await each([item.querySelector('.apm-sidemodule-imageright')!,], row);

                            item.querySelector('.apm-sidemodule-imageleft')
                                && await each([item.querySelector('.apm-sidemodule-imageleft')!,], row);
                            item.querySelector('.apm-sidemodule-textright')
                                && await each([item.querySelector('.apm-sidemodule-textright')!,], row);

                            row.length && pushRow(row, arr);
                        }
                        else if (item.classList.contains('apm-hovermodule')) {
                            const row: IDetailContentData[] = [];
                            await each([item.querySelector('div')!,], row);
                            row.length && pushRow(row, arr, 'hover-toggle-block');
                        }
                        else if (item.querySelector('.apm-fixed-width .apm-flex')) {
                            const row: IDetailContentData[] = [];
                            await each([item.querySelector('.apm-fixed-width .apm-flex')!,], row);
                            row.length && pushRow(row, arr, 'average-width');
                        }
                        // 识别列
                        else if (
                            item.classList.contains('apm-sidemodule-textleft') ||
                            item.classList.contains('apm-centerthirdcol') ||
                            item.classList.contains('apm-sidemodule-textright') ||
                            item.classList.contains('apm-flex-item-third-width') ||
                            item.classList.contains('apm-flex-item-fourth-width') ||
                            item.classList.contains('apm-hovermodule-slides-inner') ||
                            item.classList.contains('apm-rightthirdcol')
                        ) {
                            const columns: IDetailContentData[] = [];
                            await each(item.childNodes as NodeListOf<Element>, columns);
                            columns.length && pushColumns(columns, arr);
                        }
                        // 特殊处理
                        else if (item.classList.contains('apm-eventhirdcol-table')) {
                            const row: IDetailContentData[] = [];
                            const [tr1, tr2,] = item.querySelectorAll('tr');
                            for (const index in tr1.querySelectorAll(':not(noscript)>img')) {
                                const item = tr1.querySelectorAll(':not(noscript)>img')[index];
                                const columns: IDetailContentData[] = [];
                                await each([item,], columns);
                                await each([tr2.querySelectorAll('.apm-top')[index],], columns);
                                columns.length && pushColumns(columns, row);
                            }
                            // tr1.querySelectorAll(':not(noscript)>img').forEach((item, index) => {
                            //     const columns: IDetailContentData[] = [];
                            //     await each([item,], columns);
                            //     await each([tr2.querySelectorAll('.apm-top')[index],], columns);
                            //     columns.length && pushColumns(columns, row);
                            // });
                            row.length && pushRow(row, arr, 'average-width');
                        }
                        else if (item.nodeName === 'LI') {
                            await pushText(item as HTMLDivElement, arr, 'marker');
                        }
                        else if (item.nodeName === 'P' && !item.querySelector('img')) {
                            const style = item.outerHTML.match(/bold/i) ? 'bold' : undefined;
                            await pushText(item as HTMLDivElement, arr, style);
                        }
                        else if (item.nodeName.startsWith('H')) {
                            await pushTitle(item as HTMLDivElement, arr);
                        }
                        else if (item.nodeName === 'IMG') {
                            pushImg(item as HTMLImageElement, arr);
                        }
                        else if (item.childNodes.length) {
                            await each(item.childNodes as NodeListOf<Element>, arr);
                        }
                    }
                    catch (error) {
                        console.error(item, error);
                    }
                }
            };

            try {
                // each(dom.querySelectorAll('.aplus-module'));
                // each(dom.querySelectorAll('#aplus_feature_div #aplus .aplus-module'));
                if (dom.querySelector('#productDescription_feature_div #productDescription')) {
                    await each([dom.querySelector('#productDescription_feature_div #productDescription')!,]);
                }
                else {
                    await each(dom.querySelectorAll('#aplus_feature_div>#aplus .aplus-module.aplus-standard'));
                }
                return [
                    new IHtmlParseData('get_content_imgs', img_urls),
                    new IHtmlParseData('get_content_json', JSON.stringify(data)),
                ];
            }
            catch (error) {
                return [
                    new IHtmlParseData('get_content_imgs', null, '解析失败', error),
                    new IHtmlParseData('get_content_json', null, '解析失败', error),
                ];
            }
        };

        await parallel(5, skus, async (sku) => {
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
                        parse_data.push(amazon_choice(dom));
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
                        // 商品功能与规格
                        // parse_data.push(get_features_specs(dom));
                        // 商品详情内容(图 + 数据json)
                        parse_data.push(...await get_content_json(dom));
                        // sku关联
                        parse_data.push(new IHtmlParseData('get_relevance_tag', inline_variant_skus.length > 1 ? `关联:${inline_variant_skus.join('+')}` : ''));

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

