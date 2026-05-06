import { sleep } from 'radash';

/**
 * 将 HTML 片段渲染到隐藏 DOM 中，获取浏览器解析后的真实文本内容。
 *
 * 用于处理包含 HTML 实体、特殊字符的文本，通过浏览器原生解析获取准确的 innerText。
 * DOM 元素挂载到 `#hidden-text` 容器，读取后立即移除。
 *
 * @param html - 需要解析的 HTML 字符串
 * @returns 解析后的纯文本（已 trim）
 *
 * @example
 * ```ts
 * const text = await get_real_dom_text('&amp; &lt;b&gt;bold&lt;/b&gt;');
 * // text = "& <b>bold</b>"
 * ```
 */
export const get_real_dom_text = async (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;

    document.querySelector('#hidden-text')!.appendChild(div);
    await sleep(0);

    const text = div.innerText.trim();
    div.remove();

    return text;
};

/**
 * 将 HTML 片段渲染到隐藏 DOM 中，返回 DOM 元素引用（不移除）。
 *
 * 与 `get_real_dom_text` 类似，但返回 DOM 元素本身而非文本，
 * 适用于需要对解析后的 DOM 进行进一步操作的场景。
 *
 * @param html - 需要解析的 HTML 字符串
 * @returns 包含 `innerText` 和 `innerHTML` 的对象
 */
/** 基本同上 */
export const get_real_dom = async (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;

    document.querySelector('#hidden-text')!.appendChild(div);
    await sleep(0);

    // const text = div.innerText.trim();
    // div.remove();

    return {
        divDom: div,
        unDiv: () => {
            div.remove();
        },
    };
};

