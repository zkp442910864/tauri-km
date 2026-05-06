/**
 * 应用入口文件 —— 初始化视口、语言环境，挂载 React 根组件。
 *
 * 启动流程：
 * 1. 检测设备类型（mobile/desktop），配置视口参数
 * 2. 设置 dayjs 中文语言环境
 * 3. 挂载 React 根组件（StrictMode + Ant Design ConfigProvider + RouterProvider）
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { CustomRouter } from './router';
import { createViewport, getDevice } from './utils/index.ts';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'layui';
import 'layui/dist/css/layui.css';

import '@unocss/reset/eric-meyer.css';
import 'virtual:uno.css';

void (() => {
    const [, dType,] = getDevice();
    createViewport(dType);

    dayjs.locale('zh-cn');

    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <ConfigProvider locale={zhCN}>
                <RouterProvider router={CustomRouter.getInstance().router!}/>
            </ConfigProvider>
        </StrictMode>
    );
})();
