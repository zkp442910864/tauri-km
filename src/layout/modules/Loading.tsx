import { Spin } from 'antd';

/**
 * 全屏加载指示器 —— 居中显示 Ant Design Spin。
 */
export const Loading = () => {
    return (
        <div className="flex f-items-center f-justify-center un-h100vh"><Spin size="large" spinning={true}/></div>
    );
};
