
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
import { AwaitComponent } from '@/components/AwaitComponent';
import { Database } from './modules/database';
import { init_shopify_admin_api } from './modules/shopify_admin_api';
import { store_init } from './modules/store';
import { TestButton } from './components/TestButton';
import { OtherActionButton } from './components/OtherActionButton';
// console.log(resourceDir());
// desktopDir
// resourceDir

const init_promise = (async () => {
    await Promise.all([
        Database.init(),
        store_init(),
    ]);
    await init_shopify_admin_api();
})();

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
        shopify_store_url: 'https://admin.shopify.com/store/jvrwsa-aj',
    });

    const shopify_fn = async () => {
        const data = await new ShopifyAction(state.shopify_domain, assign_skus.split(','));
        console.log(data);
    };

    const amazon_fn = async () => {
        const data = await new AmazonAction(state.amazon_domain, state.amazon_collection_urls, assign_skus.split(','));
        console.log(data);
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

        void LogOrErrorSet.get_instance().capture_error(async () => {
            const start = performance.now();
            const shopify_data = await new ShopifyAction(state.shopify_domain, assign_skus.split(','));
            const amazon_data = await new AmazonAction(state.amazon_domain, state.amazon_collection_urls, assign_skus.split(','));

            const data = await new Compare(amazon_data, shopify_data).start();
            // console.log(data);
            state.result = data;
            setLoading(false);

            const execute_time = performance.now() - start;
            LogOrErrorSet.get_instance().push_log(`总计执行: ${execute_time}ms, ${(execute_time / 1000).toFixed(2)}m, ${(execute_time / 1000 / 60).toFixed(2)}m`);
        });
    };

    return (
        <AwaitComponent promise={init_promise}>
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
                        onBlur={() => {
                            const new_val = assign_skus.split(/[\s+]?，[\s+]?|[\s+]?,[\s+]?|\s+|[\s+]?\n[\s+]?/).filter(ii => ii).join(',');
                            void set_assign_skus(new_val);
                        }}
                        onChange={(e) => {
                            void set_assign_skus(e.target.value);
                        }}
                    />
                    <Button type="primary" onClick={() => void action()}>运行</Button>
                    <OtherActionButton
                        shopify_domain={state.shopify_domain}
                        assign_skus={assign_skus}
                    >
                        其他
                    </OtherActionButton>
                    <TestButton>test</TestButton>
                    {/* <Button type="primary" onClick={() => void shopify_fn()}>1: shopify</Button> */}
                    {/* <Button type="primary" onClick={() => void amazon_fn()}>2: amazon</Button> */}
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
                                                shopify_store_url={state.shopify_store_url}
                                                amazon_domain={state.amazon_domain}
                                                onClick={(item) => ser_render_code(JSON.stringify(item, null, 8), 'json')}
                                                onLoading={(e) => setLoading(e)}
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
        </AwaitComponent>
    );
};

export default Home;