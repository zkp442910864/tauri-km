//! Tauri 应用二进制入口。
//!
//! 在 Release 模式下隐藏 Windows 控制台窗口。
//! 实际应用逻辑在 `lib.rs` 的 `run()` 函数中。

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    app_lib::run();
}
