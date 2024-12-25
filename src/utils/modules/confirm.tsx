import { Modal } from 'antd';

export const confirm = (title: string, content = '执行?') => {
    return new Promise<boolean>((rel, rej) => {
        Modal.confirm({
            title,
            content,
            centered: true,
            onOk: () => {
                rel(true);
            },
            onCancel: () => {
                rej(new Error('跳出'));
            },
        });
    });
};
