import { useRef } from 'react';
import { useLocation } from 'react-router';
import { ICustomRouteObject } from '../index.type';
import { CustomRouter } from '../modules/customRouter';

/**
 * 获取当前路由对应的自定义路由配置对象。
 *
 * 通过 `useLocation` 获取当前路径，在 `CustomRouter.routerPageMap` 中查找
 * 对应的 `ICustomRouteObject`，可用于读取路由的 `title` 等自定义元数据。
 *
 * @returns 当前路径匹配的路由配置对象，未匹配时返回 `undefined`
 *
 * @example
 * ```tsx
 * const route = useRouter();
 * const pageTitle = route?.title ?? '默认标题';
 * ```
 */
export const useRouter = () => {
    const cache = useRef(CustomRouter.getInstance());
    const local = useLocation();

    return cache.current.routerPageMap[local.pathname.toLowerCase()]?.[0] as ICustomRouteObject | undefined;
};
