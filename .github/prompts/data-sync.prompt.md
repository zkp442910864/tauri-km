---
description: "执行 Amazon-Shopify 数据采集、比对或同步任务"
agent: "agent"
---

# 数据同步任务

## 任务目标
{task_description}

## 约束条件
1. 必须遵循 AGENTS.md 中定义的工程边界
2. 代码变更必须符合对应域的 Skill 规范
3. 禁止使用 any 类型
4. 所有错误必须有明确处理

## 执行步骤

### Amazon 数据采集
1. 调用 `task_find_amazon_sku` 获取完整 SKU 列表
2. 对每个 SKU 调用 `task_amazon_product_fetch_html` 获取 HTML
3. 使用 `amazon_action/utils.ts` 中的解析函数提取数据
4. 通过 `CDatabase.push_data` 写入 `amazon_product` 表
5. 价格自动 +$2 加价

### Shopify 数据同步
1. 确认 Shopify 登录状态 (`task_shopify_store_login_status`)
2. 根据比对结果类型执行对应操作:
   - `add`: 调用产品新增流程
   - `update`: 调用 `task_shopify_store_product_update_item` 逐字段更新
   - `remove`: 标记产品（暂不自动删除）
3. 记录操作结果到日志

### 数据比对
1. 从 `amazon_product` 表读取所有数据
2. 从 `shopify_product` 表读取所有数据
3. 以 SKU 为主键执行比对
4. 比对维度: 标题、价格、图片、描述、规格、评论
