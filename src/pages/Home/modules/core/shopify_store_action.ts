import { message, Modal } from 'antd';
import { IAmazonData, IDetailContentRoot, IOtherData, TParseType, TParseTypeMsg } from '../types/index.type';
import { CompareData } from './compare';
import { invoke } from '@tauri-apps/api/core';
import { LogOrErrorSet } from '@/utils';

export class ShopifyStoreAction {
    static is_login_status = false;
    static store_cookie = '';

    store_url;

    constructor(store_url: string) {
        this.store_url = store_url;
    }

    /** 一旦出现失败,记录,中断 */
    async auto_update(data: CompareData<IAmazonData>) {
        try {
            await this.has_login_status();
            const tab_id = await this.open_product_page(data);
            await this.each_update_data(data, tab_id);
            await this.save_data(data, tab_id);
        }
        catch (error) {
            console.error(error);
            message.error('存在错误,请查看日志');
        }
    }

    async auto_add(data: CompareData<IAmazonData>) {
        try {
            await this.has_login_status();
            const tab_id = await this.open_product_page(data);
            await this.each_add_data(data, tab_id);
            await this.save_data(data, tab_id);
        }
        catch (error) {
            console.error(error);
            message.error('存在错误,请查看日志');
        }
    }

    /** 确认是否登录,以及询问登录,支持手动设置 */
    async has_login_status() {
        if (ShopifyStoreAction.is_login_status) return Promise.resolve(true);

        const login_res = await invoke<string>('task_shopify_store_login', { url: this.store_url, });
        const login_json = JSON.parse(login_res) as ITauriResponse<string>;

        if (!login_json.data) {
            return Promise.reject(new Error('获取不到tab_id'));
        }

        return new Promise<boolean>((rel, rej) => {
            // TODO:通知rust 打开页面,让用户登录
            Modal.confirm({
                title: '登录验证',
                content: '请确认是否登录成功',
                okText: '验证',
                onOk: () => {
                    // TODO:确认后,通过rust获取登录后的cookie
                    // 获取不到,就不通过
                    return invoke<string>('task_shopify_store_login_status', { url: this.store_url, tabId: login_json.data, }).then((res) => {
                        const json = JSON.parse(res) as ITauriResponse<string>;
                        if (json.data) {
                            ShopifyStoreAction.is_login_status = true;
                            ShopifyStoreAction.store_cookie = json.data!;
                            rel(true);
                        }
                        else {
                            rej(new Error('登录失败.1'));
                        }
                    });
                },
                onCancel: () => {
                    // rel(false);
                    rej(new Error('登录失败.2'));
                },
            });
        });
    }

    /** 打开编辑/新增页面 */
    async open_product_page(data: CompareData<IAmazonData>) {
        // TODO: rust执行
        const val = data.type === 'add' ? 'new' : data.data.detail_map!.shopify_product_id.data as number;
        const res = await invoke<string>('task_shopify_store_product_open', { url: `${this.store_url}/products/${val}`, });
        const json = JSON.parse(res) as ITauriResponse<string>;

        if (json.status === 0) {
            return Promise.reject(new Error('编辑/新增页面:打开失败'));
        }

        return json.data!;
    }


    /** 同步遍历数据,修改类型,以及值,推送到rust,那边进行判断处理(一条一条指令的执行) */
    async each_update_data(data: CompareData<IAmazonData>, tab_id: string) {
        const p_id = data.data.detail_map!.shopify_product_id.data as number;
        const types = data.explain!.split(',') as TParseTypeMsg[];
        const shopify_data = data.data.detail_map;
        const sku = data.data.sku;

        for (const type of types) {
            const key = type.split('.')[0] as TParseType;
            const update_data = data.update_data?.detail_map?.[key];
            // debugger;
            if (update_data?.error instanceof Error || !update_data) {
                //
            }
            else {
                let value = update_data.data || '';
                if (type === 'get_price') {
                    const v_id = shopify_data?.shopify_sku_id.data as number | null;
                    value = v_id
                        ? `${v_id}&&${(update_data?.data as IOtherData).price}&&${(update_data?.data as IOtherData).old_price}`
                        : `${(update_data?.data as IOtherData).price}&&${(update_data?.data as IOtherData).old_price}`;
                }
                else if (type === 'get_banner_imgs') {
                    value = (update_data.data as string[]).join();
                }
                else if (type === 'get_content_imgs') {
                    value = (update_data.data as string[]).join();
                }
                else if (type === 'get_desc_text') {
                    value = (update_data.data as IOtherData).html!;
                }

                const res = await invoke<string>('task_shopify_store_product_update_item', {
                    url: `${this.store_url}/products/${p_id}`,
                    inputType: type,
                    data: value,
                    tabId: tab_id,
                    sku,
                });
                const json = JSON.parse(res) as ITauriResponse<null>;

                if (json.status === 0) {
                    // return Promise.reject(new Error('编辑页面:数据修改失败'));
                    LogOrErrorSet.get_instance().push_log(`编辑页面:数据修改失败: ${type} - ${res}`, { error: true, is_fill_row: true, });
                }
            }

            // await this.confirm_next();
        }
    }

    async each_add_data(data: CompareData<IAmazonData>, tab_id: string) {
        // const p_id = data.data.detail_map!.shopify_product_id.data as number;
        // const types = data.explain!.split(',') as TParseTypeMsg[];
        const sku = data.data.sku;
        const detail = data.data.detail!;

        for (const item of detail) {
            let value = item.data;
            if (item.type === 'get_price') {
                value = `${(item.data as IOtherData).price}&&${(item.data as IOtherData).old_price}`;
            }
            else if (item.type === 'get_banner_imgs') {
                value = (item.data as string[]).join();
            }
            else if (item.type === 'get_content_imgs') {
                value = (item.data as string[]).join();
            }
            else if (item.type === 'get_desc_text') {
                value = (item.data as IOtherData).html!;
            }

            if (!value) continue;
            const res = await invoke<string>('task_shopify_store_product_update_item', {
                url: `${this.store_url}/products/new`,
                inputType: `${item.type}.add`,
                data: value,
                tabId: tab_id,
                sku,
            });
            const json = JSON.parse(res) as ITauriResponse<null>;
            if (json.status === 0) {
                LogOrErrorSet.get_instance().push_log(`编辑页面:数据新增失败: ${item.type} - ${res}`, { error: true, is_fill_row: true, });
            }

            // await this.confirm_next();
        }
    }

    /** 都操作完了后,执行完成函数,并关闭窗口 */
    async save_data(data: CompareData<IAmazonData>, tab_id: string) {
        // await this.confirm_next('是否保存数据');
        const res = await invoke<string>('task_shopify_store_product_finish', { tabId: tab_id, });
        const json = JSON.parse(res) as ITauriResponse<null>;

        if (json.status === 0) {
            return Promise.reject(new Error('编辑页面:保存失败'));
        }
    }

    confirm_next(content = '是否继续下一个') {
        return new Promise<boolean>((rel, rej) => {
            Modal.confirm({
                title: '是否继续',
                content,
                okText: '继续',
                onOk: () => {
                    rel(true);
                },
                onCancel: () => {
                    rej(new Error('跳出'));
                },
            });
        });
    }
}
