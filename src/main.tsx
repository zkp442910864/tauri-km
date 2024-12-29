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
