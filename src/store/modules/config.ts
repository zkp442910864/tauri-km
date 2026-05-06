import { StateCreator, createStore, create } from 'zustand';

/**
 * Zustand 双模 Store 工厂函数 —— 同时创建 Hook 和外部访问实例。
 *
 * 解决 Zustand 的典型痛点：组件内用 Hook 订阅响应式更新，非组件代码（工具函数、
 * 事件处理器等）需要直接读写状态而不触发 re-render。
 *
 * 内部通过 `cacheFn` 保证两个 Store 实例共享同一份初始状态对象（单例缓存）。
 *
 * @typeParam T - Store 状态类型
 * @param fn - 状态创建函数，签名类似 Zustand 的 `StateCreator`，但额外接收 `cache` 参数
 * @param fn.cache - 单例缓存函数，首次调用时存储初始状态，后续返回同一引用
 * @param fn.set - Zustand 的 `set` 函数
 * @param fn.get - Zustand 的 `get` 函数
 * @param fn.api - Zustand 的 store API
 * @returns `[store, useStore]` 元组 —— store 用于外部访问，useStore 用于 React 组件
 *
 * @example
 * ```ts
 * // 定义
 * const [configStore, useConfigStore] = createCustom<IConfig>((cache, set) => cache({
 *   theme: 'light',
 *   setTheme: (t) => set({ theme: t }),
 * }));
 *
 * // 组件内
 * const theme = useConfigStore(s => s.theme);
 *
 * // 外部
 * configStore.getState().setTheme('dark');
 * ```
 */
export const createCustom = <T, >(fn: (cache: (data: T) => T, ...arg: Parameters<StateCreator<T, []>>) => T) => {
    /** 单例缓存，保证 useStore 和 store 共享同一初始状态引用 */
    let cache: T | null = null;
    const cacheFn = (data: T) => {
        if (!cache) {
            cache = data;
        }
        return cache;
    };
    // 想要触发响应 useStore 需要优先执行
    const useStore = create<T>((set, arg2, arg3) => fn(cacheFn, set, arg2, arg3));
    const store = createStore<T>((set, arg2, arg3) => fn(cacheFn, set, arg2, arg3));

    return [store, useStore,] as [typeof store, typeof useStore];
};
