import { sleep } from 'radash';

/**
 * 把内容扔到页面渲染下,获取真实的数据,然后再去对比
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
