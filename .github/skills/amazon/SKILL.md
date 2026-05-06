---
name: amazon
description: 'Amazon 域数据采集与解析。Use when: 修改 Amazon SKU 采集、产品详情 HTML 解析、价格策略、amazon_product 数据库操作、headless_chrome 抓取 Amazon 页面。'
---

# Amazon 域 Skill

## 领域概述

Amazon 域负责从 Amazon 产品页面采集 SKU 和产品详情数据，存入本地 SQLite 数据库。

## 核心模块

### 数据采集入口
- **类**: `AmazonAction` (`src/pages/Home/modules/core/amazon_action/index.ts`)
- **触发方式**: 前端实例化 `new AmazonAction(skus)` 自动执行

### SKU 采集流程
1. 调用 Tauri 命令 `task_find_amazon_sku`
2. Rust 端通过 headless_chrome 打开 Amazon 品牌集合页面
3. 自动点击 "Show more" 按钮加载全部产品
4. 提取 `data-csa-c-item-id` 属性获取 ASIN 列表
5. 返回 ASIN 数组

### 产品详情采集流程
1. 调用 Tauri 命令 `task_amazon_product_fetch_html`
2. Rust 端打开每个产品页面，等待 DOM 加载
3. 处理验证码检测
4. 触发评论排序加载
5. 返回完整 HTML 字符串

### HTML 解析函数 (`amazon_action/utils.ts`)

| 函数 | 选择器/来源 | 提取内容 |
|------|------------|----------|
| `get_title` | `#productTitle` | 产品标题 |
| `get_banner_imgs` | `ImageBlockATF` 脚本 | 轮播图 hiRes 图片 |
| `get_price` | 价格元素 | 价格（自动 +$2） |
| `get_sku_model` | `dimensionValuesDisplayData` | 型号 JSON |
| `get_desc_text` | `#feature-bullets` | 描述文案 |
| `get_detail` | `#productOverview_feature_div` + `#prodDetails` | 产品规格 |
| `get_review_data` | `#cm-cr-dp-review-list` | 5星评论 |
| `get_content_json` | 详情区域 | 详情内容 JSON |
| `get_content_imgs` | 详情区域 | 详情图片 |
| `get_choice` | Amazon's Choice 区域 | Choice 标识 |
| `get_relevance_tag` | 变体区域 | 变体关联标签 |

### 数据库操作
- **表名**: `amazon_product`
- **主键**: `sku` (TEXT, 大小写不敏感)
- **操作类**: 继承自 `CDatabase` 基类
- **写入策略**: upsert（先查后插/更）

## 价格策略

Amazon 采集的价格自动 **+$2** 加价，这是业务硬规则。

## 错误处理

- 页面加载超时: Rust 端有超时机制
- 验证码检测: 检测到验证码时返回错误
- HTML 解析失败: 各解析函数返回空值或默认值，不抛异常
- 网络错误: 通过 `LogOrErrorSet` 记录

## 变更注意事项

1. 修改 HTML 解析逻辑时，必须确认 Amazon 页面结构是否变化
2. 修改价格策略需要同步更新比对引擎
3. 新增 Tauri 命令需要在 `lib.rs` 注册
4. 数据库表结构变更需要编写迁移逻辑
