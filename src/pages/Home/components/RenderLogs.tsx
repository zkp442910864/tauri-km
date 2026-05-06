import { useStateExtend } from '@/hooks';
import { LogOrErrorSet } from '@/utils';
import { List, Spin } from 'antd';
import classNames from 'classnames';
import { FC, useEffect } from 'react';

const log_or_error = LogOrErrorSet.get_instance();

/**
 * 实时日志渲染组件 —— 订阅 LogOrErrorSet 的日志变更，自动刷新显示。
 *
 * 特性：
 * - 日志倒序显示（最新在上）
 * - 错误日志（含 `[:error]` 标记）以红色高亮
 * - 支持 HTML 内容渲染（如 error_map 的 key 链接）
 * - 右上角显示 loading 旋转指示器
 *
 * @param loading - 是否显示加载中状态
 * @param className - 可选的额外 CSS 类名
 */
export const RenderLogs: FC<{loading: boolean, className?: string}> = ({ loading, className, }) => {
    const [, update,] = useStateExtend({});

    useEffect(() => {
        log_or_error.on_log_change(() => {
            void update({});
        });
    }, []);

    return (
        <div className={classNames('rel', className)}>
            <div className="abs un-top-14px un-right-16px">
                <Spin spinning={loading ?? false}/>
            </div>
            {
                log_or_error.logs.length
                    ? <List
                        size="small"
                        bordered
                        dataSource={log_or_error.logs.slice().reverse()}
                        renderItem={(log_msg) => {
                            const is_error = log_msg.match(/\[:error\]/);
                            const str = log_msg.replace('[:error]', '');
                            return (
                                <List.Item>
                                    <div className={is_error ? 'color-error' : ''}>
                                        <span className="un-whitespace-pre-line" dangerouslySetInnerHTML={{ __html: str, }}></span>
                                    </div>
                                </List.Item>
                            );
                        }}
                    />
                    : '请执行程序'
            }
        </div>
    );
};
