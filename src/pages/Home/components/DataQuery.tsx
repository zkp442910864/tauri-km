import { useStateExtend } from '@/hooks';
import { LogOrErrorSet } from '@/utils';
import { Input, Select } from 'antd';
import classNames from 'classnames';
import { FC, useRef } from 'react';

const log_or_error = LogOrErrorSet.get_instance();

/**
 * 数据追踪查询组件 —— 通过 key 查找 LogOrErrorSet 中的 error_map 或 data_map。
 *
 * 用于调试时快速定位错误或数据快照：
 * - 选择查询类型（error_map / data_map）
 * - 输入 key（如 `error-1234567`）
 * - 点击搜索后将结果传递给 `onClick` 回调（通常用于 RenderCode 展示）
 *
 * @param onClick - 查询结果回调
 * @param className - 可选的额外 CSS 类名
 */
export const DataQuery: FC<{className?: string, onClick: (data: unknown) => void}> = ({
    onClick,
    className = '',
}) => {
    const [, update,] = useStateExtend({});
    const { current: state, } = useRef({
        select: 'error_map' as 'error_map' | 'data_map',
        input: '',
    });

    const click = (data: unknown) => {
        console.log(data);
        onClick(data);
    };

    return (
        <div className={classNames('flex f-items-center un-gap-8px', className)}>
            <label className="un-whitespace-nowrap">数据追踪:</label>
            <Input.Search
                value={state.input}
                addonBefore={(
                    <Select
                        value={state.select}
                        onChange={(e) => {
                            state.select = e;
                            void update({});
                        }}
                    >
                        <Select.Option value="error_map">error_map</Select.Option>
                        <Select.Option value="data_map">data_map</Select.Option>
                    </Select>
                )}
                onChange={(e) => {
                    state.input = e.target.value;
                    void update({});
                }}
                onSearch={() => {
                    if (state.input) {
                        const data = log_or_error[state.select];
                        if (state.select === 'error_map') {
                            if (data[state.input] instanceof Error) {
                                click({
                                    stack: (data[state.input] as Error)?.stack,
                                    message: (data[state.input] as Error)?.message,
                                    raw_error: data[state.input],
                                });
                            }
                            else {
                                click(data[state.input]);
                            }
                        }
                        else {
                            click(data[state.input]);
                        }
                    }
                    else {
                        click(log_or_error);
                    }
                }}
            />
        </div>
    );
};
