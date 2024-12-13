import { Spin } from 'antd';

export const Loading = () => {
    return (
        <div className="flex f-items-center f-justify-center un-h100vh"><Spin size="large" spinning={true}/></div>
    );
};
