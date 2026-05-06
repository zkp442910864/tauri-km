import { useRef } from 'react';
import { KeepAlive } from './keepAlive';

/**
 * KeepAlive 根容器组件 —— 作为路由树中的缓存层。
 *
 * 获取 `KeepAlive` 单例并渲染其 `Content` 组件，
 * 该组件内部通过 Portal 管理页面 DOM 的缓存与切换。
 */
export const KeepAliveRoot = () => {
    const { current: keepAlive, } = useRef(KeepAlive.getInstance());

    return (
        <>
            {/* <div>测试</div> */}
            <keepAlive.Content/>
        </>
    );
};
