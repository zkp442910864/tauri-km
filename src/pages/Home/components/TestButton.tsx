import { Button } from 'antd';
import { shopify_admin_api } from '../modules/shopify_admin_api';
import { FC, ReactNode } from 'react';


export const TestButton: FC<{children: ReactNode}> = ({ children, }) => {

    const test = async () => {
        // https://www.amazon.com/dp/B0CJXY9Z5D?language=en_US
        // {
        //     const res = await invoke<string>('take_screenshot_v2', { url: 'https://www.amazon.com/dp/B0CJXY9Z5D?language=en_US', });
        //     const json_data = JSON.parse(res) as ITauriResponse<string>;
        //     const img = document.createElement('img');
        //     img.src = 'data:image/jpeg;base64,' + json_data.data;
        //     document.body.append(img);
        // }
        // {
        //     // const data = await fs.exists('km-temp', { baseDir: BaseDirectory.Desktop, });
        //     const flag = await invoke<string>('task_create_folder', { url: await join(await desktopDir(), 'km-temp', '/abx'), });
        //     console.log(flag);
        // }
        // {
        //     // const data = await fs.exists('km-temp', { baseDir: BaseDirectory.Desktop, });
        //     const data = await fs.create(await join('km-temp', '/abx.txt'), { baseDir: BaseDirectory.Desktop, });
        //     await data.write(new TextEncoder().encode('Hello world'));
        //     await data.close();
        //     // console.log(data);
        // }
        // {
        //     await file_temp.create('qweee/sswws.txt', new TextEncoder().encode('Hello world'));
        // }
        // {
        //     const res = await invoke<string>('task_amazon_images_diff_v2', {
        //         sku: 'xxx',
        //         folderType: 'banner',
        //         shopifyUrls: [
        //             'https://chonchow.com/cdn/shop/files/download_23_dccede46-1bf3-4d8c-9946-0a656bea4567.jpg?v=1731987839',
        //             'https://chonchow.com/cdn/shop/files/download_24_bbf43735-a783-48bc-9cc1-2d2fa9ed0f9a.jpg?v=1731987839&width=1946',
        //         ],
        //         amazonUrls: [
        //             'https://m.media-amazon.com/images/S/aplus-media-library-service-media/7f3eee66-a2eb-43cb-93df-86f9c3350fb6.__CR0,0,970,600_PT0_SX970_V1___.jpg',
        //             'https://m.media-amazon.com/images/S/aplus-media-library-service-media/3f81d281-185d-4b9f-98b3-86482da72600.__CR0,0,970,600_PT0_SX970_V1___.jpg',
        //         ],
        //     });
        // }
        // {
        //     const res = await invoke<string>('task_download_imgs', {
        //         sku: 'xxx',
        //         folderType: 'banner',
        //         urls: [
        //             'https://m.media-amazon.com/images/S/aplus-media-library-service-media/7f3eee66-a2eb-43cb-93df-86f9c3350fb6.__CR0,0,970,600_PT0_SX970_V1___.jpg',
        //             'https://m.media-amazon.com/images/S/aplus-media-library-service-media/3f81d281-185d-4b9f-98b3-86482da72600.__CR0,0,970,600_PT0_SX970_V1___.jpg',
        //         ],
        //     });
        // }
        // {
        //     const urls = [
        //         'https://www.amazon.com/dp/B07XKZKBYW?language=en_US',
        //         // 'https://www.amazon.com/dp/B0C4KLQBYT?language=en_US',
        //         // 'https://www.amazon.com/dp/B0C45XWP82?language=en_US',
        //         // 'https://www.amazon.com/dp/B0CNK1J7SX?language=en_US',
        //     ];
        //     for (const url of urls) {
        //         await invoke<string>('page_sustain_screenshot', {
        //             url,
        //         });
        //     }
        // }
        // {
        //     await invoke('take_test_check', { url: 'file:///C:/Users/zhouk/Desktop/Amazon.com.html', });
        // }
        // {
        //     // await invoke('custom_test');
        //     const db = await Database.load('sqlite:test.db');
        //     // await db.execute('INSERT INTO ...');
        //     await db.execute(`
        //         CREATE TABLE IF NOT EXISTS product (
        //             sku                TEXT    PRIMARY KEY ON CONFLICT ROLLBACK
        //                                     NOT NULL,
        //             title              TEXT,
        //             price              NUMERIC,
        //             inventory          NUMERIC,
        //             model              TEXT,
        //             shopify_product_id TEXT,
        //             status             NUMERIC NOT NULL
        //                                     DEFAULT (1),
        //             create_date        TEXT,
        //             update_date        TEXT
        //         );
        //     `);
        //     await db.close();
        //     console.log(db);
        // }
        {
            const data = await shopify_admin_api.update_variant_assign_metafield('8674172567740', '44415627526332', 'inventory_detail', JSON.stringify({ a: 1, }));
            console.log(data);

        }
    };

    return <></>;
    return <Button type="primary" onClick={() => void test()}>{children}</Button>;
};
