---
description: "诊断 tauri-km 项目中的错误，定位问题来源并提供修复方案"
agent: "agent"
---

# 错误诊断

## 错误信息
{error_message}

## 诊断步骤

### 1. 确认错误来源
- **前端错误**: 检查浏览器控制台、React 错误边界
- **Rust 端错误**: 检查 Tauri 命令返回的 `Result::Err`
- **网络错误**: 检查请求超时、跨域、认证
- **业务逻辑错误**: 检查数据解析、比对逻辑

### 2. 检查日志
- 前端日志: `LogOrErrorSet` 实例
- Rust 日志: `push_web_log` 输出
- Tauri 日志: debug 模式下的 `tauri-plugin-log`

### 3. 常见错误类型

#### 网络超时
- 检查网络连接和目标网站可用性
- 确认 headless_chrome 超时配置
- 检查 Tauri HTTP 插件配置

#### 页面结构变化
- 检查 HTML 解析选择器是否匹配
- 对比实际页面 DOM 与解析代码
- 更新 `amazon_action/utils.ts` 中的选择器

#### 权限错误
- 检查 Tauri capabilities 配置
- 确认插件权限声明
- 检查文件系统访问范围

#### 数据库错误
- 检查表结构和数据完整性
- 确认 SQLite 连接状态
- 检查 SQL 语句语法

#### 浏览器自动化错误
- 确认 headless_chrome 实例状态
- 检查页面加载是否完成
- 确认 DOM 元素是否存在

### 4. 修复建议
根据诊断结果，提供具体的修复方案和代码变更。
