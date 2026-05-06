---
name: react-frontend
description: 'React 前端开发规范。Use when: 修改 React 组件、Hooks、Zustand 状态管理、UnoCSS 样式、路由配置、Ant Design 组件、前端工具函数。'
---

# React 前端 Skill

## 领域概述

前端使用 React 18 + TypeScript + Vite 构建，采用 UnoCSS 原子化样式和 Ant Design v5 组件库。

## 项目结构

```
src/
├── main.tsx             # 入口
├── App.tsx              # 根组件
├── components/          # 通用组件
│   └── AwaitComponent.tsx
├── hooks/               # 全局 hooks
│   ├── index.ts
│   └── modules/
│       ├── useCacheValue.ts
│       ├── useDebounceEffect.tsx
│       └── useStateExtend.tsx
├── layout/              # 布局系统
│   ├── index.tsx
│   ├── KeepAliveModules/  # KeepAlive 实现
│   └── modules/
│       ├── ErrorComponent.tsx
│       ├── LayoutRoot.tsx
│       ├── Loading.tsx
│       └── NoFindPage.tsx
├── pages/               # 页面
│   └── Home/
│       ├── index.tsx
│       ├── components/  # 页面组件
│       └── modules/     # 业务逻辑
├── router/              # 路由
│   ├── index.ts
│   ├── hooks/useRouter.tsx
│   └── modules/customRouter.tsx
├── store/               # 全局状态
│   ├── index.tsx
│   └── modules/config.ts
├── types/               # 类型定义
│   ├── tauri.d.ts
│   └── vite-env.d.ts
└── utils/               # 工具函数
    ├── index.ts
    └── modules/
        ├── auto_reset_fetch.ts
        ├── confirm.tsx
        ├── get_real_dom_text.ts
        ├── handle_number.ts
        ├── log_error_set.ts
        └── viewport.ts
```

## 核心 Hooks

### `useStateExtend`
增强版 useState，支持 Promise 化 setState:
```typescript
const [state, setState, lockUpdate] = useStateExtend(initialValue);
await setState(newValue); // 等待渲染完成
```

### `useCacheValue`
带 localStorage 持久化的状态:
```typescript
const [value, setValue] = useCacheValue('key', defaultValue);
```

### `useDebounceEffect`
防抖 useEffect:
```typescript
useDebounceEffect(() => {
    // 副作用
}, [deps], { wait: 16, immediate: false });
```

## 路由系统

### 自定义路由类 `CustomRouter`
- 基于 `import.meta.glob('@/pages/**/index.tsx')` 自动扫描
- Hash 路由模式
- 所有页面通过 `React.lazy` + `Suspense` 懒加载

### KeepAlive 实现
- 通过 `createPortal` 将页面 DOM 挂载到独立容器
- 切换时隐藏而非卸载
- 支持生命周期回调: `BEFORE_MOUNT`, `SEARCH`

## 状态管理

### Zustand 全局状态
```typescript
// src/store/index.tsx
const useBaseData = createCustom<IBaseData>((set) => ({
    // 状态和方法
}));
```

### Tauri Store 持久化
```typescript
// src/pages/Home/modules/store.ts
const store = new Proxy({} as StoreInstance, {
    get(target, prop) {
        // 延迟初始化
    }
});
```

## 工具模块

### `LogOrErrorSet`
全局日志/错误追踪单例:
```typescript
const log = new LogOrErrorSet();
log.push_log({ msg: '操作完成', title: '数据同步' });
log.save_error(error, '操作失败');
```

### `auto_reset_fetch`
自动重试的 fetch 封装（最多 3 次）。

### `confirm`
Ant Design Modal 确认对话框的 Promise 封装。

## 样式规范

- 使用 UnoCSS 原子化类名
- 禁止编写传统 CSS 文件
- 复杂样式使用 UnoCSS 的 `@apply` 指令

## 组件开发规范

1. 使用函数组件 + Hooks
2. 禁止在组件内定义子组件
3. 复杂状态逻辑提取到 hooks 或 store
4. 使用 TypeScript 严格类型
5. 禁止使用 `any` 类型

## 变更注意事项

1. 新增页面需要在 `src/pages/` 下创建目录
2. 通用组件放在 `src/components/`
3. 全局状态变更需要更新 Zustand store
4. 路由变更通过文件系统自动发现
5. Tauri API 调用需要处理错误和加载状态
