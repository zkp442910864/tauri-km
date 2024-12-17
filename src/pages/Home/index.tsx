
import { useCacheValue, useStateExtend } from '@/hooks';
import { LogOrErrorSet } from '@/utils';
import { Button, Input, Splitter } from 'antd';
import { useRef } from 'react';
import { ContentBox } from './components/ContentBox';
import { DataQuery } from './components/DataQuery';
import { RenderCode } from './components/RenderCode';
import { RenderLogs } from './components/RenderLogs';
import { ResultData } from './components/ResultData';
import { AmazonAction } from './modules/core/amazon_action';
import { Compare, CompareData } from './modules/core/compare';
import { ShopifyAction } from './modules/core/shopify_action';
import { invoke } from '@tauri-apps/api/core';

// console.log(resourceDir());
// desktopDir
// resourceDir

const Home = () => {

    const [, update,] = useStateExtend({});
    const [assign_skus, set_assign_skus,] = useCacheValue('assign_skus', '');
    const { current: state, } = useRef({
        result: [] as CompareData[],
        // assign_skus: '',
        render_code: '',
        render_type: 'json',
        loading: false,
        shopify_domain: 'https://chonchow.com',
        amazon_domain: 'https://www.amazon.com',
        amazon_collection_urls: [
            '/stores/page/78D7D7E4-A104-40B0-8DC1-FB61BD2F16E5',
            '/stores/page/6FF02BCB-060B-4B12-A07F-6C60EFC143F3',
            '/stores/page/BBF5BC86-5FA2-4520-A0DC-750B13670037',
            '/stores/page/814A8742-74D4-4AD6-93EA-AE0CE90D80F9/search?terms=chonchow',
        ],
        shopify_background_domain: 'https://admin.shopify.com/store/jvrwsa-aj',
    });

    const shopify_fn = async () => {
        const inline_assign_skus = assign_skus ? assign_skus.split(/[\s+]?，[\s+]?|[\s+]?,[\s+]?|\s+|[\s+]?\n[\s+]?/).filter(ii => ii) : [];
        const data = await new ShopifyAction(state.shopify_domain, inline_assign_skus);
        console.log(data);
    };

    const amazon_fn = async () => {
        const inline_assign_skus = assign_skus ? assign_skus.split(/[\s+]?，[\s+]?|[\s+]?,[\s+]?|\s+|[\s+]?\n[\s+]?/).filter(ii => ii) : [];
        const data = await new AmazonAction(state.amazon_domain, state.amazon_collection_urls, inline_assign_skus);
        console.log(data);
    };

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
        {
            const res = await invoke<string>('task_amazon_images_diff_v2', {
                sku: 'xxx',
                folderType: 'banner',
                shopifyUrls: [
                    'https://chonchow.com/cdn/shop/files/download_23_dccede46-1bf3-4d8c-9946-0a656bea4567.jpg?v=1731987839',
                    'https://chonchow.com/cdn/shop/files/download_24_bbf43735-a783-48bc-9cc1-2d2fa9ed0f9a.jpg?v=1731987839&width=1946',
                ],
                amazonUrls: [
                    'https://m.media-amazon.com/images/S/aplus-media-library-service-media/7f3eee66-a2eb-43cb-93df-86f9c3350fb6.__CR0,0,970,600_PT0_SX970_V1___.jpg',
                    'https://m.media-amazon.com/images/S/aplus-media-library-service-media/3f81d281-185d-4b9f-98b3-86482da72600.__CR0,0,970,600_PT0_SX970_V1___.jpg',
                ],
            });
        }
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
    };


    /** 设置高亮代码 */
    const ser_render_code = (content: string, type: string) => {
        state.render_code = content;
        state.render_type = type;
        void update({});
    };

    const reset = () => {
        state.result = [];
        state.loading = false;
        state.render_code = '';
        state.render_type = 'json';
        void update({});
    };

    const setLoading = (val: boolean) => {
        state.loading = val;
        void update({});
    };

    const action = () => {
        reset();
        setLoading(true);

        LogOrErrorSet.get_instance().capture_error(async () => {
            const inline_assign_skus = assign_skus ? assign_skus.split(/[\s+]?，[\s+]?|[\s+]?,[\s+]?|\s+|[\s+]?\n[\s+]?/).filter(ii => ii) : [];
            const start = performance.now();
            const shopify_data = await new ShopifyAction(state.shopify_domain, inline_assign_skus);
            const amazon_data = await new AmazonAction(state.amazon_domain, state.amazon_collection_urls, inline_assign_skus);

            const data = await new Compare(amazon_data, shopify_data).start();
            // console.log(data);
            state.result = data;
            setLoading(false);

            const execute_time = performance.now() - start;
            LogOrErrorSet.get_instance().push_log(`总计执行: ${execute_time}ms, ${(execute_time / 1000).toFixed(2)}m, ${(execute_time / 1000 / 60).toFixed(2)}m`);
        });
    };

    return (
        <div className="p-t-20">
            <div id="hidden-text" className="un-w-0 un-h-0 un-opacity0"></div>
            <div className="flex un-gap-8px p-x-20">
                <Input
                    name="sku"
                    className=" un-w-300px"
                    autoComplete="on"
                    addonBefore="指定SKU"
                    placeholder="逗号或空格间隔"
                    value={assign_skus}
                    onChange={(e) => {
                        void set_assign_skus(e.target.value);
                    }}
                />
                <Button type="primary" onClick={() => void action()}>运行</Button>
                <Button type="primary" onClick={() => void test()}>test</Button>
                {/* <Button type="primary" onClick={() => void shopify_fn()}>1: shopify</Button> */}
                <Button type="primary" onClick={() => void amazon_fn()}>2: amazon</Button>
            </div>
            <ContentBox>
                <Splitter
                    layout="vertical"
                    className="un-w-100% un-h-100%"
                    style={{ boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)', }}
                >
                    <Splitter.Panel>
                        <Splitter>
                            <Splitter.Panel>
                                <RenderLogs className="p-10" loading={state.loading}/>
                            </Splitter.Panel>

                            <Splitter.Panel>
                                <div className="flex f-col">
                                    <DataQuery
                                        className="un-sticky un-top-0 bg-f un-z2 p-10"
                                        onClick={(item) => ser_render_code(JSON.stringify(item, null, 8), 'json')}
                                    />
                                    <div className="p-10 p-t-0">
                                        <ResultData
                                            result={state.result}
                                            shopify_domain={state.shopify_domain}
                                            shopify_background_domain={state.shopify_background_domain}
                                            amazon_domain={state.amazon_domain}
                                            onClick={(item) => ser_render_code(JSON.stringify(item, null, 8), 'json')}
                                        />
                                    </div>
                                </div>
                            </Splitter.Panel>
                        </Splitter>
                    </Splitter.Panel>
                    <Splitter.Panel>
                        <RenderCode content={state.render_code} type={state.render_type} />
                    </Splitter.Panel>
                </Splitter>
            </ContentBox>
        </div>
    );
};

export default Home;