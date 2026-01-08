# 前端组件开发指南

## 组件分类

### 页面组件 (Pages)

位于 `src/pages/`，每个页面对应一个路由。

| 页面 | 路由 | 说明 |
|-----|------|------|
| Login | /login | 登录页面 |
| Register | /register | 注册页面 |
| Dashboard | /dashboard | 仪表板 |
| TaskList | /tasks | 任务列表 |
| TaskDetail | /tasks/:id | 任务详情 |
| ScriptUpload | /tasks/:id/script | 剧本上传 |
| StoryboardGen | /tasks/:id/storyboard | 分镜生成 |
| CharacterDesign | /tasks/:id/character | 角色定妆 |
| KeyframeGen | /tasks/:id/keyframe | 关键帧生成 |
| VideoGen | /tasks/:id/video | 视频生成 |
| AssetManage | /assets | 资产管理 |

### 布局组件 (Layout)

- Layout: 主布局，包含Header、Sidebar、Content
- Header: 顶部导航栏
- Sidebar: 侧边栏菜单
- Footer: 页脚（可选）

### 业务组件

- TaskCard: 任务卡片
- AssetCard: 资产卡片
- ProgressBar: 进度条
- StatusBadge: 状态标签

### 通用组件 (Common)

- Button: 按钮
- Input: 输入框
- Modal: 模态框
- Loading: 加载动画
- Toast: 提示消息

## 组件开发规范

### 组件结构

```
ComponentName/
├── ComponentName.tsx
├── ComponentName.scss
├── index.ts
└── types.ts (可选)
```

### 组件模板

```typescript
import React from 'react';
import './ComponentName.scss';

interface ComponentNameProps {
  // props定义
}

export const ComponentName: React.FC<ComponentNameProps> = (props) => {
  // 组件逻辑

  return (
    <div className="component-name">
      {/* JSX */}
    </div>
  );
};
```

### Props设计原则

1. 必需props在前，可选props在后
2. 使用TypeScript定义类型
3. 提供默认值
4. 添加注释说明

### 状态管理

- 局部状态: useState
- 全局状态: Context API
- 异步状态: 自定义Hooks

## 样式规范

### BEM命名

```scss
.task-card {
  &__header {
    // header样式
  }
  
  &__title {
    // title样式
  }
  
  &--active {
    // active修饰符
  }
}
```

### 变量使用

使用CSS变量或SCSS变量统一管理颜色、间距等。

## 性能优化

- 使用React.memo缓存组件
- useCallback缓存函数
- useMemo缓存计算结果
- 懒加载大组件
