import { sleep } from 'radash';

/** 封装 fetch,当请求有失败的情况下,自动进行重试,最多请求三次 */
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
