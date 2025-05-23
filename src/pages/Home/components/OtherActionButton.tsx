import { Button, Dropdown } from 'antd';
import { FC, ReactNode } from 'react';
import { ShopifyAction } from '../modules/core/shopify_action';
import { useStateExtend } from '@/hooks';
import { open } from '@tauri-apps/plugin-shell';
import { appDataDir, join } from '@tauri-apps/api/path';
import { confirm, log_error } from '@/utils';
import { DB_NAME, reset_database, table } from '../modules/database';
import { AmazonAction } from '../modules/core/amazon_action';
import { amazon_choice_fn } from './AmazonChoice';


export const OtherActionButton: FC<{children: ReactNode, assign_skus: string[]}> = ({
    children,
    assign_skus,
}) => {
    const [loading, setLoading,] = useStateExtend(false);

    return (
        <Dropdown
            menu={{
                items: [
                    {
                        key: 'shopify_in_sql_data',
                        label: 'shopify数据写入库',
                    },
                    {
                        key: 'shopify_in_sql_data_not_inventory',
                        label: 'shopify数据写入库(不更新库存)',
                    },
                    {
                        key: 'amazon_in_sql_data',
                        label: 'amazon数据写入库',
                    },
                    {
                        key: 'open_amazon_choice',
                        label: '亚马逊精选产品',
                    },
                    {
                        key: 'open_sql_file',
                        label: '打开sql文件',
                    },
                    {
                        key: 'open_web_cache_data_file',
                        label: '打开web_cache_data文件',
                    },
                    {
                        key: 'reset_db',
                        label: '重置数据库',
                    },
                ],
                onClick: (e) => {
                    const handleClick = async () => {
                        const key = e.key;
                        const title = (e.domEvent.target as HTMLSpanElement).innerText;

                        void setLoading(true);
                        await log_error.capture_error(async () => {
                            if (key === 'shopify_in_sql_data') {
                                await confirm(title);
                                const shopify_data = await new ShopifyAction(assign_skus, true);
                                await table.shopify_product.push_data(shopify_data.sku_data, true);
                            }
                            else if (key === 'shopify_in_sql_data_not_inventory') {
                                await confirm(title);
                                const shopify_data = await new ShopifyAction(assign_skus);
                                await table.shopify_product.push_data(shopify_data.sku_data);
                            }
                            else if (key === 'amazon_in_sql_data') {
                                await confirm(title);
                                // amazon_domain amazon_collection_urls
                                const amazon_data = await new AmazonAction(assign_skus);
                                await table.amazon_product.push_data(amazon_data.sku_data);
                            }
                            else if (key === 'open_sql_file') {
                                const base_url = await appDataDir();
                                const url = await join(base_url, DB_NAME);
                                await open(url);
                            }
                            else if (key === 'open_web_cache_data_file') {
                                const base_url = await appDataDir();
                                const url = await join(base_url, 'web_cache_data');
                                await open(url);
                            }
                            else if (key === 'reset_db') {
                                await confirm(title);
                                await reset_database();
                            }
                            else if (key === 'open_amazon_choice') {
                                await amazon_choice_fn();
                            }
                        });
                        void setLoading(false);
                    };
                    void handleClick();
                },
            }}
            placement="bottomLeft"
        >
            <Button loading={loading}>{children}</Button>
        </Dropdown>
    );
};

