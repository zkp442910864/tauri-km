import { sleep } from 'radash';

/**
 * 自动重试的 fetch 封装 —— 请求失败时自动重试，最多 3 次。
 *
 * 每次重试间隔 1 秒。适用于网络不稳定场景下的容错请求。
 *
 * @typeParam T - 请求返回值类型
 * @param fn - 返回 Promise 的请求函数
 * @returns 请求结果的 Promise，3 次均失败则 reject
 *
 * @example
 * ```ts
 * const data = await auto_reset_fetch(() => invoke('task_name'));
 * ```
 */
export const auto_reset_fetch = <T = never>(fn: () => Promise<T>) => {
    let resetCount = 3;
    const inlineFn = async () => {
        resetCount--;

        try {
            const res = await fn();
            return res;
        }
        catch (error) {
            if (resetCount <= 0) {
                console.error('请求失败');
                return Promise.reject(error as Error);
            }
            await sleep(1000);
            return inlineFn();
        }
    };

    return inlineFn;
};
