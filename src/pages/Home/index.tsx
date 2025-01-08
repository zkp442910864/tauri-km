
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
import { init_shopify_admin_api } from './modules/shopify_admin_api';
import { store, store_init } from './modules/store';
import { TestButton } from './components/TestButton';
import { OtherActionButton } from './components/OtherActionButton';
import { init_database, table } from './modules/database';
import { open } from '@tauri-apps/plugin-dialog';
import { BaseDirectory, readTextFile } from '@tauri-apps/plugin-fs';
import { IConfig } from './modules/types/index.type';
import { GLOBAL_DATA } from './modules/global_data';

const init_promise = (async () => {
    const confirm_config_data = async () => {
        let record_data = await store.get_val<IConfig[]>('configs');
        if (record_data) {
            //
        }
        else {
            const file_path = await open({
                title: '配置文件',
                multiple: false,
                directory: false,
                filters: [
                    { name: 'filter', extensions: ['json',], },
                ],
            });
            if (!file_path) return [];

            const json = await readTextFile(file_path, { baseDir: BaseDirectory.AppCache, });
            record_data = JSON.parse(json) as IConfig[];
            await store.set_val('configs', record_data);
        }

        GLOBAL_DATA.CURRENT_STORE = record_data.find(ii => ii.name === 'chonchow')!;
    };

    await store_init();
    await confirm_config_data();
    await init_database();
    init_shopify_admin_api();
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
    });

    const assign_skus_to_arr = () => {
        const new_val = assign_skus.split(/[\s+]?，[\s+]?|[\s+]?,[\s+]?|\s+|[\s+]?\n[\s+]?/).filter(ii => !!ii);
        return new_val;
    };

    const _shopify_fn = async () => {
        const data = await new ShopifyAction(assign_skus_to_arr());
        console.log(data);
    };

    const _amazon_fn = async () => {
        const data = await new AmazonAction(assign_skus_to_arr());
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
            const skus = assign_skus_to_arr();
            const where = skus.length ? `sku in (${skus.map(sku => '"' + sku + '"').join()})` : undefined;
            // const shopify_data = await new ShopifyAction(state.shopify_domain, assign_skus_to_arr());
            // const amazon_data = await new AmazonAction(state.amazon_domain, state.amazon_collection_urls, assign_skus_to_arr());
            // debugger;
            const shopify_data = await table.shopify_product.get_data(where);
            const amazon_data = await table.amazon_product.get_data(where);

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
                        onChange={(e) => {
                            void set_assign_skus(e.target.value);
                        }}
                    />
                    <Button type="primary" onClick={() => void action()}>运行(需要数据入库)</Button>
                    <OtherActionButton assign_skus={assign_skus_to_arr()} >
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