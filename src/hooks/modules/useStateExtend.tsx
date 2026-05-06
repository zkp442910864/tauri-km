import { useEffect, useRef, useState } from 'react';

/**
 * 增强版 useState —— 将 setState 包装为返回 Promise 的异步函数。
 *
 * 核心能力：
 * - 调用 `setState(newValue)` 返回 `Promise<void>`，在下一次渲染后 resolve
 * - 支持函数式更新 `setState(prev => next)`
 * - 组件卸载后自动锁定，防止已卸载组件的 setState 警告
 * - 使用 `Promise.withResolvers` 实现 Promise 化 setState
 *
 * @typeParam S - 状态值的类型
 * @param valOrFn - 初始值或惰性初始化函数（与原生 useState 一致）
 * @returns `[value, setState]` 其中 setState 返回 Promise<void>
 *
 * @example
 * ```tsx
 * const [count, setCount] = useStateExtend(0);
 *
 * const handleClick = async () => {
 *   await setCount(prev => prev + 1);
 *   console.log('渲染完成，count 已更新');
 * };
 * ```
 */
export const useStateExtend = <S, >(valOrFn: S | (() => S)) => {
    const [val, updateFn,] = useState<S>(valOrFn);
    const { current: data, } = useRef({
        /** 组件卸载锁，防止卸载后触发 setState */
        lock: false,
        /** 当前 pending 的 Promise resolve/reject 引用 */
        promiseContent: Promise.withResolvers<void>(),
        /**
         * 异步 setState —— 返回 Promise，在下一次渲染后 resolve
         * @param value - 新值或 `(prev) => next` 函数
         * @returns Promise<void>，在 re-render 后 resolve
         */
        newUpdateFn: (value: React.SetStateAction<S>) => {
            !data.lock && updateFn(value);

            data.promiseContent = Promise.withResolvers<void>();
            return data.promiseContent.promise;
        },
    });

    useEffect(() => {
        data.promiseContent.resolve();
    }, [val,]);

    useEffect(() => {
        data.lock = false;
        return () => {
            data.lock = true;
        };
    }, []);

    return [val, data.newUpdateFn,] as [S, typeof data.newUpdateFn];
};
