import { useDebounceEffect, useStateExtend } from '@/hooks';
import { Splitter } from 'antd';
import { FC, useRef } from 'react';
import { createHighlighterCoreSync, createJavaScriptRegexEngine, ShikiTransformer } from 'shiki';
import theme from 'shiki/themes/tokyo-night.mjs';
import ts from 'shiki/langs/typescript.mjs';
import json from 'shiki/langs/json.mjs';

const highlighter = createHighlighterCoreSync({
    themes: [theme,],
    langs: [ts, json,],
    engine: createJavaScriptRegexEngine(),
});
export const RenderCode: FC<{content?: string, type?: string}> = ({
    content,
    type,
}) => {

    const [, update,] = useStateExtend({});
    const { current: state, } = useRef({
        html: '',
    });

    const transformer_line_contraction = () => {
        const data: ShikiTransformer = {
            pre(node) {
                // console.log(theme, node);
                const bgColor = theme.colors?.['editor.background'];
                const lineColWidth = 50;
                const lineHeight = 28;
                const contractionColWidth = 24;
                const rootClassName = node.properties.class as string || '';
                const rootStyle = node.properties.style as string || '';

                /** 行号内容 */
                const lineNumberCode: typeof node = {
                    type: 'element',
                    tagName: 'code',
                    children: [],
                    properties: {
                        // style: `background:${bgColor};padding-right:4px;`,
                    },
                };

                /** 收缩列内容 */
                const contractionCode: typeof node = {
                    type: 'element',
                    tagName: 'code',
                    children: [],
                    properties: {
                        // style: `background:${bgColor};padding-right:4px;`,
                    },
                };

                /** 分界线内容 */
                const lineNumberRightCode: typeof node = {
                    type: 'element',
                    tagName: 'code',
                    children: [],
                    properties: {
                        // style: `background:${bgColor};padding-right:4px;`,
                    },
                };

                /** 代码内容 */
                const contentCode: typeof node = {
                    type: 'element',
                    tagName: 'code',
                    children: [],
                    properties: {
                        // style: `background:${bgColor};padding-right:4px;`,
                    },
                };

                /** 行号列 */
                const lineNumberCol: typeof node = {
                    type: 'element',
                    tagName: 'pre',
                    children: [lineNumberCode,],
                    properties: {
                        style: 'position:sticky;left:0;',
                    },
                };

                /** 收缩列 */
                const contractionCol: typeof node = {
                    type: 'element',
                    tagName: 'pre',
                    children: [contractionCode,],
                    properties: {
                        style: `min-width:${contractionColWidth}px;position:sticky;left:${lineColWidth}px;`,
                    },
                };

                /** 行号分界线列 */
                const lineNumberRightCol: typeof node = {
                    type: 'element',
                    tagName: 'pre',
                    children: [lineNumberRightCode,],
                    properties: {
                        style: `position:sticky;left:${lineColWidth + contractionColWidth}px;`,
                    },
                };

                /** 收缩函数 */
                const contraction = () => {
                    const startDivItem = this as unknown as HTMLDivElement;

                    const startIndex = [...startDivItem.parentElement!.children,].indexOf(startDivItem);
                    const currentRowText = [
                        ...startDivItem
                            .parentElement!
                            .parentElement!
                            .nextElementSibling!
                            .nextElementSibling!
                            .querySelector('code')!
                            .children as unknown as HTMLDivElement[],
                    ][startIndex].innerText;
                    const reverseFlag = { '{': '}', '[': ']', }[currentRowText.at(-1) ?? '{'];
                    const textBlankLengt = currentRowText.match(/\s+/)?.[0].length ?? 0;

                    const endIndex = [
                        ...startDivItem
                            .parentElement!
                            .parentElement!
                            .nextElementSibling!
                            .nextElementSibling!
                            .querySelector('code')!
                            .children as unknown as HTMLDivElement[],
                    ].slice(startIndex).findIndex(ii => (ii.innerText.match(/\s+/)?.[0].length ?? 0) === textBlankLengt && ii.innerText?.trim().startsWith(reverseFlag ?? '}')) + startIndex;

                    const colContent1 = [...startDivItem.parentElement!.parentElement!.previousElementSibling!.querySelector('code')!.children as unknown as HTMLDivElement[],];
                    const colContent2 = [...startDivItem.parentElement!.parentElement!.querySelector('code')!.children as unknown as HTMLDivElement[],];
                    const colContent3 = [...startDivItem.parentElement!.parentElement!.nextElementSibling!.querySelector('code')!.children as unknown as HTMLDivElement[],];
                    const colContent4 = [...startDivItem.parentElement!.parentElement!.nextElementSibling!.nextElementSibling!.querySelector('code')!.children as unknown as HTMLDivElement[],];

                    if (startDivItem.dataset.extend === 'true' || !startDivItem.dataset.extend) {
                        startDivItem.dataset.extend = 'false';
                        startDivItem.style.transform = 'rotate(0deg)';
                        colContent1.slice(startIndex + 1, endIndex).forEach(ii => ii.style.display = 'none');
                        colContent2.slice(startIndex + 1, endIndex).forEach(ii => ii.style.display = 'none');
                        colContent3.slice(startIndex + 1, endIndex).forEach(ii => ii.style.display = 'none');
                        colContent4.slice(startIndex + 1, endIndex).forEach(ii => ii.style.display = 'none');
                    }
                    else {
                        startDivItem.dataset.extend = 'true';
                        startDivItem.style.transform = 'rotate(90deg)';
                        colContent1.slice(startIndex + 1, endIndex).forEach(ii => ii.style.display = 'block');
                        colContent2.slice(startIndex + 1, endIndex).forEach(ii => ii.style.display = 'block');
                        colContent3.slice(startIndex + 1, endIndex).forEach(ii => ii.style.display = 'block');
                        colContent4.slice(startIndex + 1, endIndex).forEach(ii => ii.style.display = 'block');
                    }

                };

                let count = 0;
                // 填充数据
                (node.children[0] as typeof node).children.forEach((lineNode) => {
                    if (lineNode.type === 'element') {
                        // 行号内容
                        lineNumberCode.children.push({
                            type: 'element',
                            tagName: 'div',
                            children: [{ type: 'text', value: `${++count}`, },],
                            properties: {
                                style: `font-size:14px;text-align:right;padding-right:6px;line-height:${lineHeight}px;width:${lineColWidth}px;box-sizing:border-box;background:${bgColor};`,
                            },
                        });

                        // 识别为收缩功能
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                        if (['{', '[',].includes((lineNode.children.at(-1) as any)?.children?.[0]?.value?.trim() as string)) {
                            contractionCode.children.push({
                                type: 'element',
                                tagName: 'div',
                                children: [{ type: 'text', value: '>', },],
                                properties: {
                                    style: `user-select: none;transform: rotate(90deg);text-align:center;line-height:${lineHeight}px;width:${contractionColWidth}px;box-sizing:border-box;background:${bgColor};cursor:pointer;`,
                                    onclick: contraction.toString().replace(/\s{0,}?\(\)\s{0,}?=>\s{0,}?{/, '').replace(/\}\s{0,}?$/, ''),
                                },
                            });
                        }
                        else {
                            contractionCode.children.push({
                                type: 'element',
                                tagName: 'div',
                                children: [{ type: 'text', value: ' ', },],
                                properties: {
                                    style: `font-size:14px;text-align:right;line-height:${lineHeight}px;width:${contractionColWidth}px;box-sizing:border-box;padding-right:8px;background:${bgColor};`,
                                },
                            });
                        }

                        // 分界线
                        lineNumberRightCode.children.push({
                            type: 'element',
                            tagName: 'div',
                            children: [{ type: 'text', value: ' ', },],
                            properties: {
                                style: `width:1px;height:${lineHeight}px;background:#353535;`,
                            },
                        });

                        // 代码内容
                        lineNode.tagName = 'div';
                        lineNode.properties.style = `font-size:16px;line-height:${lineHeight}px;box-sizing:border-box;padding-left:8px;`;
                        contentCode.children.push(lineNode);
                    }
                    else if (lineNode.type === 'text') {
                        // lineNumberCode.children.push(lineNode);
                    }
                });
                node.children[0] = contentCode;

                return {
                    type: 'element',
                    tagName: 'div',
                    children: [lineNumberCol, contractionCol, lineNumberRightCol, node,],
                    properties: {
                        className: rootClassName,
                        style: 'display:flex;line-height:1.5;overflow:auto;font-size:16px;border-radius: 4px;box-sizing: border-box;width:100%;height:100%;' + rootStyle,
                    },
                };
            },
        };

        return data;
    };

    const render_data = () => {

        const html = highlighter.codeToHtml(content || '', {
            lang: type ?? 'json',
            theme: 'tokyo-night',
            transformers: [transformer_line_contraction(),],
        });


        state.html = html;
        void update({});
    };

    useDebounceEffect(() => {
        if (content) {
            render_data();
        }
        else {
            state.html = '';
            void update({});
        }
    }, [content,]);

    return (
        <div className="un-w100% un-h100%" dangerouslySetInnerHTML={{ __html: state.html, }}></div>
    );
};
