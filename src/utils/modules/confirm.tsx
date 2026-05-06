import { Modal } from 'antd';

/**
 * Promise 包装的 Ant Design Modal.confirm。
 *
 * 将回调式的确认弹窗转为 Promise：
 * - 用户点击「确定」→ resolve(true)
 * - 用户点击「取消」→ reject(Error('跳出'))
 *
 * 注意：取消时 reject 的 Error('跳出') 会被 `capture_error` 识别并静默处理。
 *
 * @param title - 弹窗标题
 * @param content - 弹窗内容文本，默认 '执行?'
 * @returns Promise<boolean>，确认时 resolve
 *
 * @example
 * ```ts
 * try {
 *   await confirm('确认删除?', '此操作不可撤销');
 *   await deleteItem();
 * } catch {
 *   // 用户取消
 * }
 * ```
 */
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
