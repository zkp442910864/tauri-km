import { Dropdown, List, message, Tag } from 'antd';
import classNames from 'classnames';
import { FC, useRef } from 'react';
import { SyncResult } from '../modules/core/sync_engine';
import { open } from '@tauri-apps/plugin-shell';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useDebounceEffect, useStateExtend } from '@/hooks';
import { GLOBAL_DATA } from '../modules/global_data';

/**
 * 同步结果展示组件 —— 以列表形式展示 SyncEngine 的输出。
 *
 * 功能：
 * - 按类型（add/update/skip/archived/error）以不同颜色 Tag 标识
 * - 点击 SKU 可跳转到 Amazon / Shopify 前台 / Shopify 后台
 * - 展示变更字段列表（update 时）
 * - 支持复制 SKU 到剪贴板
 * - 支持右键菜单记录/移除结果项
 *
 * @param result - 同步结果数组
 * @param onClick - 点击结果项的回调（用于查看详情）
 * @param onLoading - 保留参数，当前未使用
 */
export const ResultData: FC<{
    result: SyncResult[],
    onClick: (item: unknown) => void,
    onLoading: (val: boolean) => void
}> = ({
    result,
    onClick,
}) => {

    const [, update,] = useStateExtend({});
    const { current: state, } = useRef({
        result_filter_type: '',
        record_val: [] as string[],
    });
    const {
        amazon_domains,
        shopify_domain,
        shopify_store_url,
    } = GLOBAL_DATA.CURRENT_STORE.config;

    /** 根据站点代码获取 Amazon 域名 */
    const get_amazon_domain = (site?: string) => {
        const domain_item = amazon_domains?.find(d => d.site === site);
        return domain_item?.domain ?? 'https://www.amazon.com';
    };

    const color_map: Record<string, string> = {
        add: 'color-success',
        update: 'color-main',
        skip: 'color-gray',
        archived: 'color-await',
        error: 'color-red',
    };

    const type_label_map: Record<string, string> = {
        add: '新增',
        update: '更新',
        skip: '跳过',
        archived: '下架',
        error: '失败',
    };

    const link_click = (e: React.MouseEvent<HTMLDivElement, MouseEvent>, type: 'shopify' | 'amazon' | 'shopify_background', item: SyncResult) => {
        e.stopPropagation();
        if (type === 'shopify_background') {
            void open(`${shopify_store_url}/products/${item.shopify_product_id || 'new'}`);
        }
        else if (type === 'shopify') {
            void open(`${shopify_domain}/products/${item.sku}`);
        }
        else {
            void open(`${get_amazon_domain()}/dp/${item.sku}`);
        }
    };

    const toggle_type = (type: string) => {
        state.result_filter_type = type;
        void update({});
    };

    useDebounceEffect(() => {
        state.result_filter_type = '';
        state.record_val = [];
        void update({});
    }, []);

    return (
        <>
            <div className="flex f-items-center p-b-4 un-gap-6px bg-f un-sticky un-top-52px un-z2">
                <span className="pointer" onClick={() => toggle_type('')}>全部:{result.length}</span>
                <span className={classNames(color_map.add, 'pointer')} onClick={() => toggle_type('add')}>
                    新增:{result.filter(ii => ii.type === 'add').length}
                </span>
                <span className={classNames(color_map.update, 'pointer')} onClick={() => toggle_type('update')}>
                    更新:{result.filter(ii => ii.type === 'update').length}
                </span>
                <span className={classNames(color_map.skip, 'pointer')} onClick={() => toggle_type('skip')}>
                    跳过:{result.filter(ii => ii.type === 'skip').length}
                </span>
                <span className={classNames(color_map.archived, 'pointer')} onClick={() => toggle_type('archived')}>
                    下架:{result.filter(ii => ii.type === 'archived').length}
                </span>
                <span className={classNames(color_map.error, 'pointer')} onClick={() => toggle_type('error')}>
                    失败:{result.filter(ii => ii.type === 'error').length}
                </span>
                <span className="f-1"></span>
                {
                    state.record_val.length
                        ?
                        <span
                            title="点击复制"
                            className="color-main pointer"
                            onClick={() => {
                                void writeText(state.record_val.join());
                                message.success('复制成功');
                            }}
                        >...{state.record_val.at(-1)} 记录SKU({state.record_val.length})</span>
                        : ''
                }
            </div>
            {
                result.length
                    ? <List
                        size="small"
                        bordered
                        dataSource={result.filter(ii => state.result_filter_type ? ii.type === state.result_filter_type : true)}
                        renderItem={(item) => {

                            const content = () => {
                                return (
                                    <div
                                        className={classNames(color_map[item.type], 'un-cursor-pointer flex un-gap-8px un-w100% p-x-16 p-y-8')}
                                        onClick={() => onClick(item)}
                                    >
                                        <div className="f-1">
                                            <div className="flex f-items-center un-gap-8px">
                                                <Tag color={item.type === 'error' ? 'error' : item.type === 'archived' ? 'warning' : item.type === 'add' ? 'success' : item.type === 'update' ? 'processing' : 'default'}>
                                                    {type_label_map[item.type] || item.type}
                                                </Tag>
                                                <span className="un-font-bold">{item.sku}</span>
                                            </div>
                                            <div className="color-gray un-text-12px un-gap-8px flex f-wrap f-items-center">
                                                {item.changed_fields?.length ? (
                                                    <>
                                                        <span>变更字段:</span>
                                                        {item.changed_fields.map(field => (
                                                            <Tag className="un-flex-inline" key={field}>{field}</Tag>
                                                        ))}
                                                    </>
                                                ) : ''}
                                                {item.error ? <span className="color-red">错误: {item.error}</span> : ''}
                                                {item.shopify_product_id ? <span>Shopify ID: {item.shopify_product_id}</span> : ''}
                                            </div>
                                        </div>
                                        <div className="i-arcticons:shopify un-text-20px" title="打开 Shopify 后台" onClick={(e) => link_click(e, 'shopify_background', item)}></div>
                                        <div className="i-logos:shopify un-text-20px" title="打开 Shopify 前台" onClick={(e) => link_click(e, 'shopify', item)}></div>
                                        <div className="i-devicon:amazonwebservices-wordmark un-text-20px" title="打开 Amazon" onClick={(e) => link_click(e, 'amazon', item)}></div>
                                    </div>
                                );
                            };

                            return (
                                <List.Item className="flex p-0!">
                                    <Dropdown
                                        menu={{
                                            items: [
                                                { label: item.sku, key: 'title', disabled: true, },
                                                { type: 'divider', },
                                                { label: '复制 SKU', key: 'copy_sku', },
                                                { label: '记录SKU并移除', key: 'record_remove', },
                                                { label: '移除', key: 'remove', className: 'color-red!', },
                                            ],
                                            onClick: (e) => {
                                                if (e.key === 'copy_sku') {
                                                    void writeText(item.sku);
                                                    message.success('复制成功');
                                                }
                                                else if (e.key === 'record_remove') {
                                                    state.record_val.push(item.sku);
                                                    const index = result.indexOf(item);
                                                    result.splice(index, 1);
                                                    onClick({});
                                                    void update({});
                                                }
                                                else if (e.key === 'remove') {
                                                    const index = result.indexOf(item);
                                                    result.splice(index, 1);
                                                    onClick({});
                                                    void update({});
                                                }
                                            },
                                        }}
                                        trigger={['contextMenu',]}
                                    >
                                        {content()}
                                    </Dropdown>
                                </List.Item>
                            );
                        }}
                    />
                    : <div>执行结果</div>
            }
        </>
    );
};
