
import { useCacheValue, useStateExtend } from '@/hooks';
import { LogOrErrorSet } from '@/utils';
import { Button, Input, Select, Splitter } from 'antd';
import { useRef } from 'react';
import { ContentBox } from './components/ContentBox';
import { DataQuery } from './components/DataQuery';
import { RenderCode } from './components/RenderCode';
import { RenderLogs } from './components/RenderLogs';
import { ResultData } from './components/ResultData';
import { SyncEngine, SyncResult } from './modules/core/sync_engine';
import { AwaitComponent } from '@/components/AwaitComponent';
import { init_shopify_admin_api } from './modules/shopify_admin_api';
import { store, store_init } from './modules/store';
import { TestButton } from './components/TestButton';
import { OtherActionButton } from './components/OtherActionButton';
import { init_database } from './modules/database';
import { IConfig } from './modules/types/index.type';
import { GLOBAL_DATA } from './modules/global_data';

/**
 * 应用初始化流程 —— 加载配置、初始化数据库和 Shopify API。
 *
 * 流程：
 * 1. 从 Tauri Store 读取配置列表，若无则使用默认空配置并写入 Store
 * 2. 初始化数据库（创建表结构）
 * 3. 初始化 Shopify Admin API（设置 access_token 和 store_url）
 * 4. 将配置写入 GLOBAL_DATA（一次性写入，后续通过配置弹窗修改）
 *
 * 用户可通过「其他 → 配置管理」手动编辑配置，保存后实时生效。
 */
const init_promise = (async () => {
    const confirm_config_data = async () => {
        let record_data = await store.get_val<IConfig[]>('configs');
        if (!record_data) {
            // 首次启动无配置，使用默认空配置并持久化
            record_data = [GLOBAL_DATA.CURRENT_STORE,];
            await store.set_val('configs', record_data);
        }

        const current = record_data.find(ii => ii.name === GLOBAL_DATA.CURRENT_STORE.name);
        if (current) {
            GLOBAL_DATA.CURRENT_STORE = current;
            console.log(current);
        }
    };

    await store_init();
    await confirm_config_data();
    await init_database();
    init_shopify_admin_api();
})();

/**
 * Home 页面主组件 —— 应用的核心工作台。
 *
 * 功能：
 * - SKU 输入框：支持逗号、空格、换行分隔的多 SKU 输入
 * - 数据同步：通过 SyncEngine 遍历 Amazon 数据，调用 Shopify API 同步
 * - 结果展示：ResultData 组件展示同步结果（add/update/skip/archived/error）
 * - 日志面板：RenderLogs 实时显示操作日志
 * - 代码预览：RenderCode 高亮展示 JSON/TS 数据
 * - 辅助操作：OtherActionButton 提供数据库管理、文件操作等
 */
const HomeInline = () => {

    const [, update,] = useStateExtend({});
    const [assign_skus, set_assign_skus,] = useCacheValue('assign_skus', '');
    const [current_site, set_current_site,] = useCacheValue('current_site', 'us');
    const { current: state, } = useRef({
        result: [] as SyncResult[],
        render_code: '',
        render_type: 'json',
        loading: false,
    });

    const assign_skus_to_arr = () => {
        const new_val = assign_skus.split(/[\s+]?，[\s+]?|[\s+]?,[\s+]?|\s+|[\s+]?\n[\s+]?/).filter(ii => !!ii);
        return new_val;
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

            const engine = new SyncEngine(current_site, skus, { abort_on_error: true });
            const results = await engine.start();

            state.result = results;
            setLoading(false);

            const execute_time = performance.now() - start;
            LogOrErrorSet.get_instance().push_log(`总计执行: ${execute_time}ms, ${(execute_time / 1000).toFixed(2)}s, ${(execute_time / 1000 / 60).toFixed(2)}m`);
        });
    };

    return (
        <>
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
                    <Select
                        className="un-w-120px"
                        value={current_site}
                        onChange={(val) => void set_current_site(val)}
                    >
                        {GLOBAL_DATA.CURRENT_STORE.config.amazon_domains.map(d => (
                            <Select.Option key={d.site} value={d.site}>{d.site}</Select.Option>
                        ))}
                    </Select>
                    <Button type="primary" onClick={() => void action()}>运行(需要数据入库)</Button>
                    <OtherActionButton assign_skus={assign_skus_to_arr()} site={current_site}>
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
        </>
    );
};

const Home = () => {
    return <AwaitComponent promise={init_promise}><HomeInline/></AwaitComponent>;
};

export default Home;
