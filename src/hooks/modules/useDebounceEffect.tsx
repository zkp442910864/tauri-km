import { useEffect, useRef, useState } from 'react';

/**
 * 防抖版 useEffect —— 依赖变化后延迟执行副作用函数。
 *
 * 核心能力：
 * - 依赖变化后延迟执行 effect，默认 16ms（约一帧）
 * - 支持 `immediate` 模式：首次立即执行，后续防抖
 * - 自动管理 effect 返回的 cleanup 函数生命周期
 * - 快速连续变更时只执行最后一次
 *
 * @param effect - 副作用函数，可返回 cleanup 函数
 * @param deps - 依赖数组（与 useEffect 一致）
 * @param options - 配置项
 * @param options.interval - 防抖延迟（毫秒），默认 16
 * @param options.immediate - 是否首次立即执行，默认 false
 *
 * @example
 * ```tsx
 * // 搜索输入防抖
 * useDebounceEffect(
 *   () => { fetchSearchResults(keyword); },
 *   [keyword],
 *   { interval: 300 }
 * );
 * ```
 */
export const useDebounceEffect = (effect: React.EffectCallback, deps?: React.DependencyList, options?: {interval?: number, immediate?: boolean}) => {
    const [, update,] = useState({});
    const { current: data, } = useRef({
        /** 是否为首次执行（immediate 模式下首次立即触发） */
        immediate: options?.immediate ?? false,
        /** 防抖定时器 ID */
        timeId: null as ReturnType<typeof setTimeout> | null,
        /** effect 返回的 cleanup 函数 */
        destroy: undefined as ReturnType<typeof effect>,
    });


    useEffect(() => {
        if (data.immediate) {
            // 立即执行的情况下，因为顺序问题，所以不需要执行 "update"，会成功触发下面 "data.destroy"
            data.immediate = false;
            data.destroy = effect();
        }
        else {
            data.timeId && clearTimeout(data.timeId);
            data.timeId = setTimeout(() => {
                data.destroy = effect();
                data.timeId = null;
                data.destroy && update({});
            }, options?.interval ?? 16);
        }
    }, deps);

    /** 当 cleanup 函数变化时，执行上一次的 cleanup */
    useEffect(() => {
        if (data.destroy) {
            const fn = data.destroy;
            data.destroy = undefined;
            return fn;
        }
    }, [data.destroy,]);
};

