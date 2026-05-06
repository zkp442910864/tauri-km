
/**
 * 全局日志与错误追踪单例。
 *
 * 用于替代 `console.log` 进行调试，提供：
 * - 结构化日志收集（`push_log`），支持标题/重复/错误/填充行等标记
 * - 错误存储（`save_error`），返回可追溯的 key
 * - 数据快照存储（`save_data`），用于调试时保存中间数据
 * - 安全的 try-catch 包装（`capture_error`），自动记录错误
 * - 日志变更回调（`on_log_change`），用于 UI 实时刷新
 *
 * @example
 * ```ts
 * const log = LogOrErrorSet.get_instance();
 * log.push_log('开始处理', { title: true });
 * const result = await log.capture_error(() => riskyOperation());
 * ```
 */
export class LogOrErrorSet {
    static instance: LogOrErrorSet;
    /** 错误存储映射，key 为 `error-{timestamp*random}` */
    error_map: Record<string, unknown> = {};
    /** 数据快照存储映射，key 为 `data-{timestamp*random}` */
    data_map: Record<string, unknown> = {};
    /** 结构化日志列表，每条格式为 `text|title: msg[:error]` */
    logs: string[] = [];
    /** 日志变更回调列表，当日志更新时触发 */
    logCallback: Array<() => void> = [];

    private constructor() {}

    /** 获取全局单例实例 */
    static get_instance() {
        if (!this.instance) {
            this.instance = new LogOrErrorSet();
            console.log(this.instance);
        }
        return this.instance;
    }

    /**
     * 存储错误到 error_map，返回可追溯的 HTML 标记字符串
     * @param error - 任意错误对象
     * @returns 包含 key 的 HTML span 标记，用于在日志中显示
     */
    save_error(error: unknown) {
        const key = `error-${Date.now() * Math.random()}`;
        if (this.error_map[key]) {
            console.error('ErrorSet: 生成key有问题,出现重复');
        }
        this.error_map[key] = error;
        return `<span class="color-await">请根据 ${key} ,去 error_map 中查找</span>`;
    }

    /**
     * 存储数据快照到 data_map，返回可追溯的 HTML 标记字符串
     * @param data - 任意数据对象
     * @returns 包含 key 的 HTML span 标记，用于在日志中显示
     */
    save_data(data: unknown) {
        const key = `data-${Date.now() * Math.random()}`;
        if (this.data_map[key]) {
            console.error('ErrorSet: 生成key有问题,出现重复');
        }
        this.data_map[key] = data;
        return `<span class="color-await">请根据 ${key} ,去 data_map 中查找</span>`;
    }

    /**
     * 推送一条结构化日志
     * @param msg - 日志消息文本
     * @param options - 日志选项
     * @param options.repeat - 替换最后一条日志（用于进度更新场景）
     * @param options.title - 标记为标题级日志
     * @param options.error - 标记为错误日志（追加 `[:error]` 后缀）
     * @param options.is_fill_row - 插入后追加一条 `---` 分隔行
     */
    push_log(msg: string, { repeat = false, title = false, error = false, is_fill_row = false, } = {}) {
        if (title) {
            msg = `title: ${msg}`;
        }
        else {
            msg = `text: ${msg}`;
        }

        if (error) {
            msg = `${msg}[:error]`;
        }

        if (repeat && this.logs.length) {
            const lastIndex = this.logs.length - 1;
            this.logs[lastIndex] = msg;
        }
        else {
            this.logs.push(msg);
        }

        if (is_fill_row) {
            this.logs.push('---');
        }

        this.logCallback.forEach(ii => ii());
    }

    /**
     * 安全执行函数 —— 包装 try-catch，自动记录错误到日志系统
     * @typeParam T - 返回值类型
     * @param fn - 要执行的函数（支持同步和异步）
     * @param error_flag - 可选的错误标记，会附加到错误数据中便于定位
     * @returns 函数执行结果；出错时返回 null 并自动记录错误
     */
    async capture_error<T>(fn: () => T, error_flag?: unknown) {
        const data = {
            success: false,
            data: null as unknown,
            msg: undefined as string | undefined,
        };
        try {
            data.success = true;
            data.data = await fn();
        }
        catch (error) {
            if (error instanceof Error && error.message === '跳出') {
                //
            }
            else {
                const error_data = { error, error_message: error?.toString(), error_flag, };
                console.error(error_data);
                data.success = false;
                data.msg = this.save_error(error_data);
                data.data = error;
                this.push_log(`capture_error捕获错误: ${data.msg}`, { error: true, is_fill_row: true, });
            }
        }
        return data.data as T;
    }

    /**
     * 注册日志变更回调 —— 每次 push_log / clear 后触发
     * @param fn - 回调函数（通常用于触发 UI 重新渲染）
     */
    on_log_change(fn: () => void) {
        this.logCallback.push(fn);
    }

    /** 清空所有日志、错误和数据快照，并触发回调通知 */
    clear() {
        this.error_map = {};
        this.data_map = {};
        this.logs = [];

        this.logCallback.forEach(ii => ii());
    }
}

/**
 * LogOrErrorSet 的便捷代理实例。
 *
 * 通过 Proxy 延迟访问 `LogOrErrorSet.get_instance()` 的属性，
 * 无需手动调用 `get_instance()` 即可直接使用。
 *
 * @example
 * ```ts
 * import { log_error } from '@/utils';
 * log_error.push_log('操作完成');
 * const result = await log_error.capture_error(() => doSomething());
 * ```
 */
export const log_error = new Proxy({} as LogOrErrorSet, {
    get: (_, property) => {
        return LogOrErrorSet.instance[property as keyof LogOrErrorSet];
    },
});

