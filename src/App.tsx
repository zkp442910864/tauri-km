import { useEffect, useMemo, useRef } from 'react';
import { Outlet } from 'react-router';
import { useRouter } from './router';

/**
 * 应用根组件 —— 路由布局容器。
 *
 * 职责：
 * 1. 根据当前路由配置动态更新 `document.title`
 * 2. 渲染 `<Outlet />` 作为子路由出口
 *
 * 使用 `useMemo` 缓存 `<Outlet />`，避免不必要的重渲染。
 */
const App = () => {
    // const local = useLocation();
    const page = useRouter();
    const { current: cache, } = useRef({
        title: document.title,
    });

    useEffect(() => {
        document.title = page?.title ?? cache.title;
    }, [page,]);

    return useMemo(() => <Outlet />, []);
};

export default App;
