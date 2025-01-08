
export class LogOrErrorSet {
    static instance: LogOrErrorSet;
    error_map: Record<string, unknown> = {};
    data_map: Record<string, unknown> = {};
    logs: string[] = [];
    logCallback: Array<() => void> = [];

    private constructor() {}

    static get_instance() {
        if (!this.instance) {
            this.instance = new LogOrErrorSet();
            console.log(this.instance);
        }
        return this.instance;
    }

    save_error(error: unknown) {
        const key = `error-${Date.now() * Math.random()}`;
        if (this.error_map[key]) {
            console.error('ErrorSet: 生成key有问题,出现重复');
        }
        this.error_map[key] = error;
        return `<span class="color-await">请根据 ${key} ,去 error_map 中查找</span>`;
    }

    save_data(data: unknown) {
        const key = `data-${Date.now() * Math.random()}`;
        if (this.data_map[key]) {
            console.error('ErrorSet: 生成key有问题,出现重复');
        }
        this.data_map[key] = data;
        return `<span class="color-await">请根据 ${key} ,去 data_map 中查找</span>`;
    }

    /**
     * repeat 替换最后一条数据
     * title 标识为标题
     * error 标识为错误
     * is_fill_row 是否在插入后,再插入填充行
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

    on_log_change(fn: () => void) {
        this.logCallback.push(fn);
    }

    clear() {
        this.error_map = {};
        this.data_map = {};
        this.logs = [];

        this.logCallback.forEach(ii => ii());
    }
}

export const log_error = new Proxy({} as LogOrErrorSet, {
    get: (_, property) => {
        return LogOrErrorSet.instance[property as keyof LogOrErrorSet];
    },
});

