# tauri-km 项目 Copilot 指令

## 项目上下文

这是一个 Tauri v2 桌面应用，用于 Amazon 和 Shopify 产品数据同步管理。

## 代码风格要求

### TypeScript/React
- 使用函数组件 + Hooks
- 使用 `useStateExtend` 替代原生 `useState`（支持 Promise 化 setState）
- 使用 `useCacheValue` 进行 localStorage 持久化
- 使用 `LogOrErrorSet` 进行日志和错误追踪
- 路径别名: `@/` 映射到 `src/`
- CSS: 使用 UnoCSS 原子化类名
- UI 组件: 使用 Ant Design v5

### Rust/Tauri
- Tauri 命令返回 `Result<T, String>`
- 阻塞操作使用 `spawn_blocking`
- 模块组织在 `src-tauri/src/modules/`
- 所有命令必须在 `lib.rs` 注册

## 业务域知识

### Amazon 域
- SKU 采集: 通过 headless_chrome 抓取品牌集合页面
- 产品详情: 解析 HTML 提取标题、价格、图片、描述等
- 价格策略: 自动 +$2 加价
- 数据库表: `amazon_product`

### Shopify 域
- SKU 采集: 通过 GraphQL API 分页获取
- 产品操作: 通过 headless_chrome 模拟后台操作
- 数据库表: `shopify_product`

### 比对引擎
- 以 SKU 为主键
- 结果类型: add / update / remove / fit / warn
- 比对维度: 标题、价格、图片、描述、规格、评论

## 禁止事项

1. 禁止使用 `any` 类型
2. 禁止直接操作 DOM（除工具函数外）
3. 禁止在组件内定义组件
4. 禁止使用 `console.log` 调试
5. 禁止在 Tauri 命令中 panic
6. 禁止硬编码敏感信息

## Skill 强制调用规则

> ⚠️ 修改代码前**必须先读取对应域的 SKILL.md**，禁止凭记忆直接修改。
>
> - Amazon 域变更 → `.github/skills/amazon/SKILL.md`
> - Shopify 域变更 → `.github/skills/shopify/SKILL.md`
> - Tauri/Rust 变更 → `.github/skills/tauri-rust/SKILL.md`
> - React 前端变更 → `.github/skills/react-frontend/SKILL.md`
> - 变更影响评估 → `.github/skills/harness-boundary/SKILL.md`

## 变更影响评估

修改代码前必须考虑：
- 是否影响 Tauri 命令接口
- 是否需要前后端同步变更
- 是否涉及敏感数据
- 是否有错误处理
