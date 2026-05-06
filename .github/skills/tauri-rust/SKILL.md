---
name: tauri-rust
description: 'Tauri v2 Rust 端开发规范。Use when: 修改 Tauri 命令、headless_chrome 浏览器操作、Rust 模块、Cargo 依赖、capabilities 权限、图片比对、spawn_blocking 异步。'
---

# Tauri/Rust 端 Skill

## 领域概述

Tauri/Rust 端负责系统级操作，包括浏览器自动化、图片处理、文件操作等。

## 项目结构

```
src-tauri/
├── Cargo.toml           # 依赖配置
├── build.rs             # 构建脚本
├── tauri.conf.json      # Tauri 配置
├── capabilities/        # 权限声明
│   ├── default.json
│   └── desktop.json
├── icons/               # 应用图标
└── src/
    ├── main.rs          # 入口
    ├── lib.rs           # Tauri Builder 配置 + 命令注册
    └── modules/
        ├── mod.rs       # 模块导出 + 通用命令
        ├── amazon_mod.rs    # Amazon 相关命令
        ├── shopify_mod.rs   # Shopify 相关命令
        ├── common_mod.rs    # 通用功能（浏览器、截图等）
        ├── log_mod.rs       # 日志模块
        └── other_model.rs   # 数据模型
```

## 核心依赖

| Crate | 用途 |
|-------|------|
| `headless_chrome` | 无头浏览器自动化 |
| `tokio` | 异步运行时 |
| `reqwest` | HTTP 客户端 |
| `base64` | Base64 编解码 |
| `template-matching` | 图片模板匹配 (SSD) |
| `image` | 图片处理 |
| `serde` / `serde_json` | JSON 序列化 |
| `lazy_static` | 全局静态变量 |
| `futures` | 异步工具 |

## Tauri 插件

| 插件 | 用途 |
|------|------|
| `tauri-plugin-window-state` | 窗口状态持久化 |
| `tauri-plugin-dialog` | 文件对话框 |
| `tauri-plugin-sql` | SQLite 数据库 |
| `tauri-plugin-store` | KV 存储 |
| `tauri-plugin-persisted-scope` | 权限范围持久化 |
| `tauri-plugin-clipboard-manager` | 剪贴板 |
| `tauri-plugin-fs` | 文件系统 |
| `tauri-plugin-shell` | Shell 命令 |
| `tauri-plugin-http` | HTTP 请求 |
| `tauri-plugin-log` | 日志（仅 debug 模式） |

## 命令开发规范

### 命令签名模板
```rust
#[command]
pub async fn my_command(app: AppHandle, param: String) -> Result<String, String> {
    let result = task::spawn_blocking(move || -> Result<String, String> {
        // 阻塞操作
        Ok("result".to_string())
    }).await;

    match result {
        Ok(inner) => inner,
        Err(e) => Err(format!("任务执行失败: {}", e)),
    }
}
```

### 命令注册
所有命令必须在 `lib.rs` 的 `invoke_handler` 中注册:
```rust
.invoke_handler(tauri::generate_handler![
    my_command,
    // ...
])
```

## 浏览器管理

### 全局浏览器实例
- `MY_BROWSER`: 全局 headless_chrome 实例
- `MY_BROWSER_STATUS`: 浏览器状态管理

### 浏览器操作模式
1. `start_browser(url)`: 启动浏览器并导航到 URL
2. 执行页面操作（点击、输入、截图等）
3. `tab.close(true)`: 关闭标签页

### 窗口事件处理
- 监听 `Destroyed` 事件
- Windows 下通过 `taskkill` 终止浏览器进程

## 图片比对

使用 SSD (Sum of Squared Differences) 算法:
```rust
// task_amazon_images_diff / task_amazon_images_diff_v2
// 输入: 两组图片 URL 或 base64
// 输出: 差异分数
```

## 错误处理规范

1. 所有 Tauri 命令返回 `Result<T, String>`
2. 使用 `.map_err(|e| format!("描述: {}", e))` 转换错误
3. spawn_blocking 内部的 panic 会被 tokio 捕获
4. 禁止在命令中直接 `unwrap()` 可能失败的操作

## 变更注意事项

1. 新增命令必须在 `lib.rs` 注册
2. 新增插件需要在 `Cargo.toml` 添加依赖
3. 权限变更需要更新 `capabilities/` 下的 JSON 文件
4. 浏览器操作必须有超时机制
5. 文件操作限制在应用数据目录内
