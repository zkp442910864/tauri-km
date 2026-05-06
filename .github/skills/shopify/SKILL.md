---
name: shopify
description: 'Shopify 域数据同步与后台操作。Use when: 修改 Shopify GraphQL API 查询、产品后台自动化操作、登录流程、shopify_product 数据库操作、ShopifyStoreAction。'
---

# Shopify 域 Skill

## 领域概述

Shopify 域负责通过 GraphQL API 和页面自动化操作，管理 Shopify 店铺的产品数据。

## 核心模块

### 数据采集
- **类**: `ShopifyAction` (`src/pages/Home/modules/core/shopify_action.ts`)
- **API 封装**: `src/pages/Home/modules/shopify_admin_api/`

### 后台操作
- **类**: `ShopifyStoreAction` (`src/pages/Home/modules/core/shopify_store_action.ts`)

## SKU 采集流程 (GraphQL API)

1. 调用 `shopify_admin_api.get_all_product()`
2. 使用 GraphQL 分页查询所有 active 产品
3. 提取每个产品的第一个 variant 的 SKU 和 ID
4. 返回 SKU 列表

### GraphQL 查询结构
```graphql
query ($first: Int!, $after: String) {
  products(first: $first, after: $after, query: "status:active") {
    edges {
      cursor
      node {
        id
        variants(first: 1) {
          edges {
            node {
              sku
              id
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
    }
  }
}
```

## 产品详情采集

1. 通过 `window.fetch` 请求 Shopify 前台产品页面
2. 解析 HTML 中嵌入的 JSON 数据 (`#product-info-data` 等)
3. 转换为统一的 `TParseData[]` 格式

## 后台自动化操作

### 登录流程
1. 调用 `task_shopify_store_login` 打开登录页面
2. 用户手动确认登录
3. 调用 `task_shopify_store_login_status` 验证登录状态
4. 提取 cookies 存入 Tauri Store

### 产品编辑
- **标题**: `input[name=title]` 填充
- **价格**: 打开变体编辑页面，修改 `input[name=price]` 和 `input[name=compareAtPrice]`
- **描述**: 富文本编辑器操作
- **图片**: 文件上传 (`input[type=file]`)
- **标签/品牌/集合**: 输入框操作
- **Metafields**: 通过 `#pinned-metafields-anchor` 区域操作

### 产品新增
- 操作 `/products/new` 页面，流程类似编辑

## Tauri 命令

| 命令 | 功能 |
|------|------|
| `task_shopify_store_login` | 打开登录页面 |
| `task_shopify_store_login_status` | 验证登录状态 |
| `task_shopify_store_product_open` | 打开产品编辑页面 |
| `task_shopify_store_product_update_item` | 执行单字段更新 |
| `task_shopify_store_product_finish` | 完成产品操作 |
| `take_graphql_client` | 代理 GraphQL 请求 |

## 数据库操作
- **表名**: `shopify_product`
- **主键**: `sku` (TEXT, 大小写不敏感)
- **额外字段**: `shopify_product_id`, `shopify_sku_id`, `shopify_inventory`

## 配置依赖

Shopify 操作依赖配置文件中的:
- `access_token`: Admin API 访问令牌
- `api_version`: API 版本号
- `store_domain`: 店铺域名
- `shopify_store_url`: 后台管理 URL

## 变更注意事项

1. GraphQL 查询变更需要确认 API 版本兼容性
2. 页面自动化依赖 DOM 结构，Shopify 后台更新可能导致失效
3. Cookie 管理涉及安全，禁止明文存储
4. 新增后台操作需要添加对应的 Tauri 命令
