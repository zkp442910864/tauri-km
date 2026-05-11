# tauri-km Agent 工程指令

## 项目概述

tauri-km 是一个 **Tauri v2 桌面应用**，核心业务是 Amazon 产品数据与 Shopify 店铺数据的同步管理工具。通过无头浏览器抓取 Amazon 产品页面，通过 Shopify Admin GraphQL API 和页面自动化操作，实现两个平台之间的产品数据比对、新增、更新和删除。

## 技术栈约束

| 层级 | 技术 | 版本约束 |
|------|------|----------|
| 前端框架 | React + TypeScript | React 18, TS ESNext |
| 构建工具 | Vite | v6 |
| 桌面框架 | Tauri | v2 |
| UI 库 | Ant Design | v5 |
| CSS | UnoCSS | 原子化，禁止写传统 CSS |
| 状态管理 | Zustand | v5 |
| 路由 | React Router | v7, Hash 路由 |
| 数据库 | SQLite | 通过 @tauri-apps/plugin-sql |
| 浏览器自动化 | headless_chrome | Rust crate |
| HTTP | reqwest (Rust) + plugin-http (前端) | |

## 工程边界规则

### 1. 前端边界

- **路径别名**: `@/` 映射到 `src/`，所有 import 必须使用此别名
- **组件规范**: 所有页面组件放在 `src/pages/` 下，通用组件放在 `src/components/`
- **Hooks 规范**: 自定义 hooks 放在 `src/hooks/`，页面级 hooks 放在对应页面目录
- **状态管理**: 全局状态用 Zustand (`src/store/`)，页面状态用 `useStateExtend`
- **禁止事项**:
  - 禁止直接操作 DOM（除 `get_real_dom_text` 工具函数外）
  - 禁止使用 `any` 类型（除非有明确注释说明原因）
  - 禁止在组件内定义组件
  - 禁止使用 `console.log` 进行调试（使用 `LogOrErrorSet` 替代）

### 2. Rust/Tauri 边界

- **命令注册**: 所有 Tauri 命令必须在 `lib.rs` 的 `invoke_handler` 中注册
- **模块组织**: 功能模块放在 `src-tauri/src/modules/`，按业务域划分
- **错误处理**: Tauri 命令返回 `Result<T, String>`，前端通过 try-catch 捕获
- **异步规范**: 阻塞操作必须使用 `spawn_blocking`，IO 操作使用 `tokio::task`
- **禁止事项**:
  - 禁止在 Tauri 命令中直接 panic
  - 禁止绕过 Tauri 插件系统直接访问系统资源
  - 禁止在 Rust 端硬编码业务逻辑（业务逻辑应在前端）

### 3. 业务域边界

#### Amazon 域
- 数据采集: `AmazonAction` 类负责
- HTML 解析: `src/pages/Home/modules/core/amazon_action/utils.ts`
- 数据库表: `amazon_product`
- Tauri 命令: `task_find_amazon_sku`, `task_amazon_product_fetch_html`

#### Shopify 域
- 数据采集: `ShopifyAction` 类负责
- 后台操作: `ShopifyStoreAction` 类负责
- API 封装: `src/pages/Home/modules/shopify_admin_api/`
- 数据库表: `shopify_product`
- Tauri 命令: `task_shopify_store_*` 系列

#### 比对引擎
- 核心逻辑: `src/pages/Home/modules/core/compare.ts`
- 以 SKU 为主键进行比对
- 结果类型: `add` | `update` | `remove` | `fit` | `warn`

### 4. 数据流边界

```
Amazon 页面 → headless_chrome → HTML 解析 → SQLite (amazon_product)
                                                    ↓
                                               Compare 比对引擎
                                                    ↓
Shopify API → GraphQL 查询 → 数据转换 → SQLite (shopify_product)
                                                    ↓
                                          比对结果 → Shopify 后台自动化
```

### 5. 安全边界

- **配置文件**: 包含 access_token 等敏感信息，禁止提交到版本控制
- **浏览器操作**: 所有 headless_chrome 操作必须有超时机制
- **文件操作**: 仅允许操作 `km-temp` 目录和应用数据目录
- **网络请求**: 所有外部请求必须通过 Tauri HTTP 插件或 Rust 端代理

## 文件组织规范

### 应用代码
```
src/
├── components/          # 通用组件
├── hooks/               # 全局自定义 hooks
├── layout/              # 布局组件
├── pages/               # 页面组件
│   └── Home/
│       ├── components/  # 页面级组件
│       └── modules/     # 业务逻辑模块
│           ├── core/    # 核心业务逻辑
│           ├── database/# 数据库操作
│           └── types/   # 类型定义
├── router/              # 路由配置
├── store/               # 全局状态管理
├── types/               # 全局类型定义
└── utils/               # 工具函数
```

### Agent 工程配置 (`.github/`)
```
.github/
├── copilot-instructions.md          # Copilot 项目级指令
├── skills/                          # 领域知识技能（按需加载）
│   ├── amazon/SKILL.md              # Amazon 域知识
│   ├── shopify/SKILL.md             # Shopify 域知识
│   ├── tauri-rust/SKILL.md          # Tauri/Rust 端知识
│   ├── react-frontend/SKILL.md      # React 前端知识
│   └── harness-boundary/SKILL.md    # 工程边界约束
└── prompts/                         # Prompt 模板（按需触发）
    ├── data-sync.prompt.md          # 数据同步任务
    ├── code-review.prompt.md        # 代码审查
    └── error-diagnosis.prompt.md    # 错误诊断
```

## Skill 强制调用规则

> ⚠️ **关键约束**：在进行任何代码变更前，**必须先读取对应域的 SKILL.md 文件**，获取领域知识和注意事项后再动手。

### 调用时机

| 变更内容 | 必须读取的 Skill |
|---------|------------------|
| Amazon SKU 采集、产品解析、amazon_product 操作 | `.github/skills/amazon/SKILL.md` |
| Shopify GraphQL API、产品操作、shopify_product 操作 | `.github/skills/shopify/SKILL.md` |
| Tauri 命令、headless_chrome、Rust 模块、Cargo 依赖 | `.github/skills/tauri-rust/SKILL.md` |
| React 组件、Hooks、Zustand、UnoCSS、路由 | `.github/skills/react-frontend/SKILL.md` |
| 变更影响评估、安全边界、工程规范审查 | `.github/skills/harness-boundary/SKILL.md` |

### 执行流程

```
用户请求 → 判断涉及的业务域 → 读取对应 SKILL.md → 理解领域约束 → 执行代码变更
```

### 禁止事项
- 禁止跳过 SKILL.md 直接修改代码
- 禁止凭记忆修改，必须重新读取最新 SKILL.md 内容
- 多个域交叉变更时，必须读取所有涉及的 SKILL.md

## 变更审查清单

在进行任何代码变更前，必须确认：

1. [ ] **已读取对应域的 SKILL.md**
2. [ ] 变更是否符合对应域的边界规则
3. [ ] 是否引入了新的外部依赖（需要评估必要性）
4. [ ] 是否修改了 Tauri 命令接口（需要前后端同步变更）
5. [ ] 是否涉及敏感数据处理
6. [ ] 是否有对应的错误处理和日志记录
7. [ ] 类型定义是否完整（禁止 any）
