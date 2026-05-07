/* eslint-disable react-refresh/only-export-components */
import { useStateExtend } from '@/hooks';
import { log_error } from '@/utils';
import { Button, Form, Input, Select, Space, Typography, message } from 'antd';
import { createRoot } from 'react-dom/client';
import { GLOBAL_DATA, update_current_config } from '../modules/global_data';
import { IConfig } from '../modules/types/index.type';

/**
 * 配置编辑器组件 —— 以表单形式编辑当前店铺配置。
 *
 * 功能：
 * - 展示当前 GLOBAL_DATA 中的配置数据
 * - 支持编辑所有配置字段（access_token、api_version、store_domain 等）
 * - amazon_collection_urls 支持多值标签输入
 * - 保存时同步更新 GLOBAL_DATA 内存 + Tauri Store 持久化
 */
const ConfigEditor = () => {
    const [form,] = Form.useForm<IConfig['config']>();
    const [loading, setLoading,] = useStateExtend(false);

    /** 初始化表单值为当前配置 */
    const init_values: IConfig['config'] = {
        ...GLOBAL_DATA.CURRENT_STORE.config,
        amazon_collection_urls: [...GLOBAL_DATA.CURRENT_STORE.config.amazon_collection_urls,],
    };

    /**
     * 保存配置 —— 校验表单后更新全局配置和持久化存储
     */
    const handle_save = async () => {
        void setLoading(true);
        await log_error.capture_error(async () => {
            const values = await form.validateFields();
            const new_config: IConfig = {
                name: GLOBAL_DATA.CURRENT_STORE.name,
                config: values,
            };
            await update_current_config(new_config);
            void message.success('配置已保存');
        });
        void setLoading(false);
    };

    return (
        <div className="p-20">
            <Form
                form={form}
                layout="vertical"
                initialValues={init_values}
                className="un-max-w-600px"
            >
                <Typography.Title level={5}>Shopify 配置</Typography.Title>
                <Form.Item
                    label="Access Token"
                    name="access_token"
                    rules={[{ required: true, message: '请输入 Access Token', },]}
                >
                    <Input.Password placeholder="Shopify Admin API Access Token" />
                </Form.Item>
                <Form.Item
                    label="API Version"
                    name="api_version"
                    rules={[{ required: true, message: '请输入 API Version', },]}
                >
                    <Input placeholder="如 2024-01" />
                </Form.Item>
                <Form.Item
                    label="Store Domain"
                    name="store_domain"
                    rules={[{ required: true, message: '请输入 Store Domain', },]}
                >
                    <Input placeholder="如 mystore.myshopify.com" />
                </Form.Item>
                <Form.Item
                    label="Shopify Store URL"
                    name="shopify_store_url"
                >
                    <Input placeholder="Shopify 后台完整 URL" />
                </Form.Item>
                <Form.Item
                    label="Shopify Domain"
                    name="shopify_domain"
                >
                    <Input placeholder="Shopify 域名" />
                </Form.Item>

                <Typography.Title level={5}>Amazon 配置</Typography.Title>
                <Form.Item
                    label="Amazon Domain"
                    name="amazon_domain"
                    rules={[{ required: true, message: '请输入 Amazon Domain', },]}
                >
                    <Input placeholder="如 https://www.amazon.com" />
                </Form.Item>
                <Form.Item
                    label="Amazon Collection URLs"
                    name="amazon_collection_urls"
                    tooltip="品牌集合页面的路径，支持多个"
                >
                    <Select
                        mode="tags"
                        placeholder="输入路径后回车添加，如 /stores/page/xxx"
                        tokenSeparators={[',',]}
                    />
                </Form.Item>

                <Form.Item className="un-m-0!">
                    <Space>
                        <Button type="primary" loading={loading} onClick={() => void handle_save()}>
                            保存配置
                        </Button>
                    </Space>
                </Form.Item>
            </Form>
        </div>
    );
};

/**
 * 打开配置编辑器弹窗 —— 通过 `window.layer` 以独立弹层展示配置表单。
 *
 * 参考 `amazon_choice_fn` 的实现方式，使用 `createRoot` 将 React 组件挂载到弹层 DOM。
 *
 * @returns Promise<boolean>，弹窗关闭时 resolve
 *
 * @example
 * ```ts
 * await config_editor_fn();
 * ```
 */
export const config_editor_fn = () => {
    const { promise, resolve, } = Promise.withResolvers<boolean>();
    const dom_id = `modal-${Date.now()}`;
    let render: ReturnType<typeof createRoot>;

    window.layer.open({
        type: 1,
        area: ['500px', '80%',],
        title: '配置管理',
        shadeClose: false,
        maxmin: true,
        anim: 0,
        shade: 0,
        content: `<div id="${dom_id}"></div>`,
        success: () => {
            const div = document.querySelector('#' + dom_id)!;
            render = createRoot(div);
            render.render(<ConfigEditor />);
        },
        yes: () => {},
        end: () => {
            resolve(false);
            render.unmount();
        },
    });

    return promise;
};
