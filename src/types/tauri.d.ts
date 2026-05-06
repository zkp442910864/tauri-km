
/**
 * Tauri 命令统一响应结构 —— 对应 Rust 端 `Response<T>` 的 JSON 序列化结果。
 *
 * 所有 Tauri 命令返回的 JSON 字符串都可解析为此类型。
 * - `status: 1` 表示成功，`0` 表示失败
 * - `data` 为业务数据（成功时有值）
 * - `message` 为错误信息（失败时有值）
 */
interface ITauriResponse<T = never> {
    message: string | null;
    data: T | null;
    status: number;
}
