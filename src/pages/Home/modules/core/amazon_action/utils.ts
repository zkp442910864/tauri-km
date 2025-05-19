
import { get_real_dom, get_real_dom_text, handle_number } from '@/utils';
import { IHtmlParseData, IDetailContentRoot, IDetailContentData, IReviewData } from '../../types/index.type';

export const get_model = (dom: Document) => {
    return JSON.parse(dom.documentElement.outerHTML.match(/"dimensionValuesDisplayData"\s+?:(.*),\n/)?.[1] ?? '{}') as Record<string, string[]>;
};

export const get_title = (dom: Document) => {
    try {
        return new IHtmlParseData('get_title', (dom.querySelector('#productTitle') as HTMLElement)?.innerText.trim());
    }
    catch (error) {
        return new IHtmlParseData('get_title', null, '解析失败', error);
    }
};

export const get_choice = (dom: Document) => {
    const text = (dom.querySelector<HTMLDivElement>('#acBadge_feature_div')?.innerText || '').toLocaleLowerCase();
    return text.indexOf('choice') > -1;
};

export const get_banner_imgs = (dom: Document) => {
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

export const get_price = (dom: Document) => {
    let price = -1;
    let old_price = -1;
    dom.querySelectorAll<HTMLSpanElement>('#apex_desktop .aok-offscreen')?.forEach((item, index) => {
        if (index === 0) {
            price = handle_number(item.innerText.trim().match(/\$([\d.]+)\s?/)?.[1] ?? -1);
            /** 小于10的+2处理 */
            if (price <= 10) {
                price = price + 2;
            }
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

export const get_sku_model = (dom: Document, sku: string, detail_model: string) => {
    try {
        const data = JSON.parse(dom.documentElement.outerHTML.match(/"dimensionValuesDisplayData"\s+?:(.*),\n/)?.[1] ?? '{}') as Record<string, string[]>;
        return new IHtmlParseData('get_sku_model', `${detail_model}&&&&${data[sku].join().replaceAll(',', ' ')}`);
    }
    catch (_) {
        return new IHtmlParseData('get_sku_model', `${detail_model}&&&&no model`);
        // return new IHtmlParseData('get_sku_model', null, '解析失败', error);
    }
};

export const get_desc_text = async (dom: Document) => {
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

export const get_review_data = async (dom: Document) => {
    try {
        const el = dom.querySelector('#cm-cr-dp-review-list');
        const html = el?.outerHTML || '';
        const { divDom, unDiv, } = await get_real_dom(html);
        const lis = divDom.querySelectorAll<HTMLLIElement>('li');
        const arr: IReviewData[] = [];
        [...lis,].forEach((item) => {
            const data = {
                name: (item.querySelector<HTMLSpanElement>('.a-profile-name')?.innerText || '').trim(),
                review: +(item.querySelector<HTMLSpanElement>('.review-rating')?.getAttribute('class')?.match(/a-star-(\d)/)?.[1] || 1),
                text: (item.querySelector<HTMLDivElement>('.review-text-content')?.innerText || '').trim(),
                date: (item.querySelector<HTMLSpanElement>('.review-date')?.innerText.split('on')[1] || '').trim(),
                model: (item.querySelector<HTMLSpanElement>('[data-hook="format-strip-linkless"]')?.innerText || '').trim(),
                avatar: (item.querySelector<HTMLImageElement>('.a-profile-avatar img')?.src || '').trim(),
            };
            if (data.review >= 5) {
                arr.push(data);
            }
        });

        unDiv();
        return new IHtmlParseData('get_review_data', JSON.stringify(arr));
    }
    catch (error) {
        return new IHtmlParseData('get_review_data', null, '解析失败', error);
    }
};

export const get_detail = (dom: Document) => {
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

export const get_detail_v2 = (dom: Document) => {
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

export const get_features_specs = (dom: Document) => {
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

export const get_content_json = async (dom: Document) => {
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
                else if (item.classList.contains('premium-aplus-two-column')) {
                    const row: IDetailContentData[] = [];
                    await each([...item.children,], row);

                    row.length && pushRow(row, arr, 'average-width');
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
                    item.classList.contains('premium-aplus-column') ||
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
        else if (dom.querySelectorAll('#aplus_feature_div>#aplus .aplus-module.aplus-standard').length) {
            await each(dom.querySelectorAll('#aplus_feature_div>#aplus .aplus-module.aplus-standard'));
        }
        else {
            await each(dom.querySelectorAll('#aplus_feature_div>#aplus>.desktop>div'));
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

