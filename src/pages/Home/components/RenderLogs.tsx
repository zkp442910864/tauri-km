import { useStateExtend } from '@/hooks';
import { LogOrErrorSet } from '@/utils';
import { List, Spin } from 'antd';
import classNames from 'classnames';
import { FC, useEffect } from 'react';

const log_or_error = LogOrErrorSet.get_instance();
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
                        dataSource={log_or_error.logs}
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
