import { create } from 'zustand';
import { createCustom } from './modules/config';

/**
 * 基础测试用 Store —— 用于开发阶段的功能验证。
 * 生产环境中可移除。
 */
export const useBaseData = create<IUseBaseData>((set) => ({
    init: 0,
    test: 1,
    updateTest: () => set((state) => ({ test: ++state.test, })),
}));

/**
 * 全局系统错误 Store —— 收集 AJAX 请求错误数据。
 *
 * 通过 `createCustom` 创建，同时支持：
 * - `useSystemErrorStore` —— React 组件内通过 Hook 订阅
 * - `systemErrorStore` —— 外部逻辑直接通过 `.getState()` 访问
 */
export const [systemErrorStore, useSystemErrorStore,] = createCustom<ISystemError>((cache, set) => cache({
    ajaxData: [],
    updateAjaxData: (newData) => set((state) => {
        state.ajaxData.push(...newData);
        return {
            ajaxData: state.ajaxData.slice(),
        };
    }),
}));

interface IUseBaseData {
    init: number;
    test: number;
    updateTest: () => void;
}

interface ISystemError {
    ajaxData: never[];
    updateAjaxData: (data: never[]) => void;
}
