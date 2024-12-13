import { List } from 'antd';
import classNames from 'classnames';
import { FC } from 'react';
import { CompareData } from '../modules/core/compare';
import { IAmazonData } from '../modules/core/index.type';

export const ResultData: FC<{result: CompareData[], shopify_domain: string, amazon_domain: string, onClick: (item: CompareData<IAmazonData>) => void}> = ({
    result,
    shopify_domain,
    amazon_domain,
    onClick,
}) => {

    const color_map = {
        add: 'color-success',
        remove: 'color-red',
        warn: 'color-await',
        update: 'color-main',
    };

    const link_click = (e: React.MouseEvent<HTMLDivElement, MouseEvent>, type: 'shopify' | 'amazon', item: CompareData<IAmazonData>) => {
        e.stopPropagation();
        if (type === 'shopify') {
            void open(`${shopify_domain}/products/${item.data.sku}`);
        }
        else {
            void open(`${amazon_domain}/dp/${item.data.sku}`);
        }
    };

    return (
        <>
            {
                result.length
                    ? <List
                        size="small"
                        bordered
                        dataSource={result}
                        renderItem={(item) => {

                            const content = () => {
                                return (
                                    <div
                                        className={classNames(color_map[item.type], 'un-cursor-pointer flex un-gap-6px un-w100%')}
                                        title="查看详情json"
                                        onClick={() => onClick(item)}
                                    >
                                        <div className="f-1">
                                            <div>{item.data_type}-{item.type}-{item.data.sku}</div>
                                            <div className="color-gray un-text-12px">explain: {item.explain}</div>
                                        </div>
                                        <div className="i-logos:shopify un-text-20px" title="打开链接" onClick={(e) => link_click(e, 'shopify', item)}></div>
                                        <div className="i-devicon:amazonwebservices-wordmark un-text-20px" title="打开链接" onClick={(e) => link_click(e, 'amazon', item)}></div>
                                    </div>
                                );
                            };
                            return (
                                <List.Item className="flex">
                                    {content()}
                                </List.Item>
                            );
                        }}
                    />
                    : <div>执行结果</div>
            }
        </>
    );
};
