import { ELifeCycleType, KeepAlive } from './keepAlive';

export * from './KeepAliveRoot';

/** keep-alive 控制器 */
export const keepAliveControl = KeepAlive.getInstance();

/** 对应的生命周期 */
export const useLifeCycle = keepAliveControl.useLifeCycle;

export {
    ELifeCycleType
};
// window.keepAliveControl = keepAliveControl;