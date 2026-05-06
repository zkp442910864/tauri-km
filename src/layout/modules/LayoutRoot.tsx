import { Outlet } from 'react-router';

/**
 * 应用布局根组件。
 *
 * 作为路由树的中间层，提供统一的布局容器。
 * 当前仅渲染 `<Outlet />`（子路由出口），预留了导航栏等扩展位置。
 * 通过 UnoCSS 原子类名控制布局样式。
 */
export const LayoutRoot = () => {

    return (
        <>
            {/* <div className="p-4 flex un-justify-evenly m-b-10 un-border-dashed un-border-indigo-500 un-border">
                <Link to={'Home'}>Home</Link>
            </div> */}
            <Outlet />
        </>
    );
};
