import { useDebounceEffect } from '@/hooks';
import { Loading } from '@/layout';
import { FC, ReactNode, useRef, useState } from 'react';

/**
 * 异步等待组件 —— 在 Promise 完成前显示 Loading，完成后渲染子组件。
 *
 * 用于需要等待异步数据加载完成后再渲染的场景（如路由懒加载、数据预取）。
 *
 * @param children - Promise 完成后渲染的内容
 * @param promise - 需要等待的 Promise
 *
 * @example
 * ```tsx
 * <AwaitComponent promise={loadConfig()}>
 *   <ConfigPanel />
 * </AwaitComponent>
 * ```
 */
export const AwaitComponent: FC<{children: ReactNode, promise: Promise<unknown>}> = ({
    children,
    promise,
}) => {
    const loading = useRef(true);
    const [, update,] = useState({});

    useDebounceEffect(() => {
        loading.current = true;

        void promise.then(() => {
            loading.current = false;
            update({});
        });

    }, [promise,]);

    if (loading.current) {
        return <Loading/>;
    }

    return children;
};
