import { useEffect } from 'react';
import { useStateExtend } from './useStateExtend';

/**
 * 带 localStorage 持久化的状态 Hook。
 *
 * 基于 `useStateExtend` 实现，额外提供：
 * - 挂载时自动从 localStorage 读取缓存值
 * - 每次 setState 时自动同步写入 localStorage
 * - 序列化/反序列化使用 JSON.stringify / JSON.parse
 *
 * @typeParam S - 状态值的类型
 * @param key - localStorage 存储键名
 * @param valOrFn - 初始值或惰性初始化函数（仅在 localStorage 无缓存时生效）
 * @returns `[value, setState]` 其中 setState 返回 Promise<void>
 *
 * @example
 * ```tsx
 * const [theme, setTheme] = useCacheValue('app-theme', 'light');
 *
 * // 切换主题，同时自动持久化到 localStorage
 * await setTheme(prev => prev === 'light' ? 'dark' : 'light');
 * ```
 */
export const useCacheValue = <S, >(key: string, valOrFn: S | (() => S)) => {
    const [state, setState,] = useStateExtend(valOrFn);

    /**
     * 包装后的 setState —— 先写入 localStorage，再触发 React 状态更新
     */
    const newSetState: typeof setState = async (unknownVal) => {
        const val = typeof unknownVal === 'function' ? (unknownVal as (data: S) => S)(state) : unknownVal;

        window.localStorage.setItem(key, JSON.stringify(val))!;

        await setState(val);
    };

    /** 挂载时从 localStorage 恢复缓存值 */
    useEffect(() => {
        try {
            const val = window.localStorage.getItem(key)!;
            if (val) {
                void setState(JSON.parse(val) as S);
            }
        }
        catch (_) {
            //
        }
    }, []);

    return [state, newSetState,]as [S, typeof newSetState];
};
