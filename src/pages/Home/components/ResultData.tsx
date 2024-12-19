import { Dropdown, List, message, Tag } from 'antd';
import classNames from 'classnames';
import { FC, useEffect, useRef } from 'react';
import { CompareData } from '../modules/core/compare';
import { IAmazonData, IDetailContentRoot, IOtherData, TParseType, TParseTypeMsg } from '../modules/core/index.type';
import { open } from '@tauri-apps/plugin-shell';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useDebounceEffect, useStateExtend } from '@/hooks';
import { ShopifyStoreAction } from '../modules/core/shopify_store_action';

export const ResultData: FC<{result: CompareData[], shopify_store_url: string, shopify_domain: string, amazon_domain: string, onClick: (item: unknown) => void}> = ({
    result,
    shopify_domain,
    amazon_domain,
    shopify_store_url,
    onClick,
}) => {

    const [, update,] = useStateExtend({});
    const { current: state, } = useRef({
        result_filter_type: '',
        record_val: [] as string[],
        shopify_store_action: null as null | ShopifyStoreAction,
    });

    const color_map = {
        add: 'color-success',
        remove: 'color-red',
        warn: 'color-await',
        update: 'color-main',
    };

    const link_click = (e: React.MouseEvent<HTMLDivElement, MouseEvent>, type: 'shopify' | 'amazon' | 'shopify_background', item: CompareData<IAmazonData>) => {
        e.stopPropagation();
        if (type === 'shopify_background') {
            // console.log(item.data.detail_map?.shopify_product_id.data as string);
            void open(`${shopify_store_url}/products/${(item.data.detail_map?.shopify_product_id?.data as string) || 'new'}`);
        }
        else if (type === 'shopify') {
            void open(`${shopify_domain}/products/${item.data.sku}`);
        }
        else {
            void open(`${amazon_domain}/dp/${item.data.sku}`);
        }
    };

    const auto_update_item = (e: React.MouseEvent<HTMLDivElement, MouseEvent>, item: CompareData<IAmazonData>) => {
        e.stopPropagation();
        void state.shopify_store_action?.auto_update(item);
    };

    const auto_add_item = (e: React.MouseEvent<HTMLDivElement, MouseEvent>, item: CompareData<IAmazonData>) => {
        e.stopPropagation();
        void state.shopify_store_action?.auto_add(item);
    };

    const tag_click = (e: React.MouseEvent<HTMLSpanElement, MouseEvent>, type: TParseTypeMsg, item: CompareData<IAmazonData>) => {
        e.stopPropagation();

        const key = type.split('.')[0] as TParseType;
        if (item.data?.detail_map?.[key] && item.update_data?.detail_map?.[key]) {
            onClick([
                item.data?.detail_map?.[key],
                item.update_data.detail_map[key],
            ]);
        }
    };

    const tag_copy = async (e: React.MouseEvent<HTMLSpanElement, MouseEvent>, type: TParseTypeMsg, item: CompareData<IAmazonData>) => {

        const key = type.split('.')[0] as TParseType;
        const data = item.update_data?.detail_map?.[key];
        if (!data) {
            // console.warn(`type: ${type}, key: ${key}, 匹配不到`);
            return;
        }

        let content = '';
        switch (key) {
            case 'get_title':
                content = data.data as string;
                break;
            case 'amazon_address_url':
                content = data.data as string;
                break;
            case 'get_price':
                content = `${(data.data as IOtherData).price}`;
                break;
            case 'get_detail':
                content = data.data as string;
                break;
            case 'get_desc_text':
                content = `${(data.data as IOtherData).html}`;
                break;
            case 'get_features_specs':
                content = data.data as string;
                break;
            case 'get_content_json': {
                const json = JSON.parse(data.data as string) as Partial<IDetailContentRoot>;
                delete json.img_urls;
                content = JSON.stringify(json);
                break;
            }
            case 'get_sku_model':
                content = data.data as string;
                break;
        }

        if (!content) {
            message.error('不可复制');
        }
        else {
            await writeText(content);
            message.success('复制成功');
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

    useDebounceEffect(() => {
        state.shopify_store_action = new ShopifyStoreAction(shopify_store_url);
    }, [shopify_store_url,]);

    return (
        <>
            <div className="flex f-items-center p-b-4 un-gap-6px bg-f un-sticky un-top-52px un-z2">
                <span className="pointer" onClick={() => toggle_type('')}>全部:{result.length}</span>
                <span className={classNames(color_map.add, 'pointer')} onClick={() => toggle_type('add')}>新增:{result.filter(ii => ii.type === 'add').length}</span>
                <span className={classNames(color_map.update, 'pointer')} onClick={() => toggle_type('update')}>修改:{result.filter(ii => ii.type === 'update').length}</span>
                <span className={classNames(color_map.warn, 'pointer')} onClick={() => toggle_type('warn')}>警告:{result.filter(ii => ii.type === 'warn').length}</span>
                <span className={classNames(color_map.remove, 'pointer')} onClick={() => toggle_type('remove')}>删除:{result.filter(ii => ii.type === 'remove').length}</span>
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
                        >...{state.record_val.at(-1)}记录SKU</span>
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
                                            <div>{item.data_type}-{item.type}-{item.data.sku}</div>
                                            <div className="color-gray un-text-12px un-gap-8px flex f-wrap f-items-center">
                                                <span>explain:</span>
                                                {(() => {
                                                    if (item.type === 'update') {
                                                        return (item.explain?.split(',') as TParseTypeMsg[]).map(val => {

                                                            return (
                                                                <Tag className="un-flex-inline un-gap-4px" key={val} onClick={(e) => tag_click(e, val, item)}>
                                                                    <span>{val}</span>
                                                                    <span className="color-main" onClick={(e) => void tag_copy(e, val, item)}>复制</span>
                                                                </Tag>
                                                            );
                                                        });
                                                    }

                                                    return <span dangerouslySetInnerHTML={{ __html: item.explain || '', }}></span>;
                                                })()}
                                            </div>
                                        </div>
                                        {(() => {
                                            if (item.type === 'update') {
                                                return <div className="i-icon-park-twotone:update-rotation un-text-20px" title="自动更新" onClick={(e) => auto_update_item(e, item)}></div>;
                                            }
                                            if (item.type === 'add') {
                                                return <div className="i-icon-park-twotone:update-rotation un-text-20px" title="自动添加" onClick={(e) => auto_add_item(e, item)}></div>;
                                            }
                                            return '';
                                        })()}
                                        <div className="i-arcticons:shopify un-text-20px" title="打开链接" onClick={(e) => link_click(e, 'shopify_background', item)}></div>
                                        <div className="i-logos:shopify un-text-20px" title="打开链接" onClick={(e) => link_click(e, 'shopify', item)}></div>
                                        <div className="i-devicon:amazonwebservices-wordmark un-text-20px" title="打开链接" onClick={(e) => link_click(e, 'amazon', item)}></div>
                                    </div>
                                );
                            };

                            return (
                                <List.Item className="flex p-0!">
                                    <Dropdown
                                        menu={{
                                            items: [
                                                { label: item.data.sku, key: 'title', disabled: true, },
                                                { type: 'divider', },
                                                { label: '记录SKU并移除', key: 'record_remove', className: '', },
                                                { label: '移除', key: 'remove', className: 'color-red!', },
                                            ],
                                            onClick: (e) => {
                                                const remove = () => {
                                                    const index = result.indexOf(item);
                                                    result.splice(index, 1);
                                                };

                                                if (e.key === 'record_remove') {
                                                    state.record_val.push(item.data.sku);
                                                    remove();
                                                    void update({});
                                                }
                                                else if (e.key === 'remove') {
                                                    remove();
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
