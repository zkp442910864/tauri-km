import { Button, Dropdown } from 'antd';
import { FC, ReactNode } from 'react';
import { ShopifyAction } from '../modules/core/shopify_action';
import { useStateExtend } from '@/hooks';
import { open } from '@tauri-apps/plugin-shell';
import { appDataDir, join } from '@tauri-apps/api/path';
import { Database, database } from '../modules/database';
import { shopify_admin_api } from '../modules/shopify_admin_api';
import { confirm, log_error } from '@/utils';
import { IOtherData } from '../modules/types/index.type';


export const OtherActionButton: FC<{shopify_domain: string, children: ReactNode, assign_skus: string[]}> = ({
    shopify_domain,
    children,
    assign_skus,
}) => {
    const [loading, setLoading,] = useStateExtend(false);

    return (
        <Dropdown
            menu={{
                items: [
                    {
                        key: 'in_sql_data',
                        label: 'shopify数据写入库',
                    },
                    {
                        key: 'open_sql_file',
                        label: '打开sql文件',
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
                            if (key === 'in_sql_data') {
                                await confirm(title);
                                const shopify_data = await new ShopifyAction(shopify_domain, assign_skus);
                                for (const item of shopify_data.sku_data) {
                                    await log_error.capture_error(async () => {
                                        const data = item.detail_map!.shopify_inventory_detail.data as IOtherData;
                                        const inventory_data = await shopify_admin_api.get_inventory_detail(`${item.detail_map!.shopify_sku_id.data! as number}`);
                                        data.inventory_total = inventory_data.inventory_quantity;
                                        inventory_data.data.forEach(({ name, quantity, }) => {
                                            switch (name) {
                                                case 'US':
                                                    data.inventory_us = quantity;
                                                    break;
                                                case 'CA':
                                                    data.inventory_ca = quantity;
                                                    break;
                                            }
                                        });
                                    }, item);
                                }
                                await database.product_push_data(shopify_data.sku_data);
                            }
                            else if (key === 'open_sql_file') {
                                const base_url = await appDataDir();
                                const url = await join(base_url, Database.DB_NAME);
                                await open(url);
                            }
                            else if (key === 'reset_db') {
                                await confirm(title);
                                await database.reset_db();
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

