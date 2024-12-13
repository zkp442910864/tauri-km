
/** tauri数据响应结构 */
interface ITauriResponse<T = never> {
    message: string | null;
    data: T | null;
    status: number;
}
