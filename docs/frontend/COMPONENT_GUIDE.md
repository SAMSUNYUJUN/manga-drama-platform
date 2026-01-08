# 前端组件开发指南

## UI/UX 设计原则

为了提升用户体验并确保界面风格的一致性与专业感，所有前端开发必须遵循以下设计原则：

### 1. 视觉风格：高端、简约、设计感
- **简约而不简单**：追求极简主义（Minimalism），通过大量的留白（Negative Space）来突出核心内容，避免冗余的装饰。
- **色彩规范**：使用深邃、高级的配色方案。以中性色（灰、黑、白）为基调，点缀具有品牌感的强调色。避免使用过饱和或杂乱的颜色。
- **排版设计**：利用排版（Typography）建立视觉层级。使用现代、易读的字体，通过字号、字重和行间距的变化来引导用户视觉流动。
- **动效微交互**：加入细腻、平滑的过渡动效和微交互（Micro-interactions），增强界面的“生命力”和操作反馈，提升高端感。

### 2. 工程质量：良好封装、可读性、可维护性
- **组件化封装**：遵循“单一职责原则”，将复杂的UI拆分为独立、可复用的组件。每个组件应具备清晰的接口（Props）和内部逻辑，避免耦合。
- **代码可读性**：变量、函数和组件命名应具有语义化，能够“自我解释”。复杂逻辑需配合精炼的注释，确保其他开发者或AI Agent能快速理解。
- **样式维护性**：优先使用CSS变量管理主题配置。样式结构清晰，避免使用深层嵌套和过多的全局选择器。
- **可扩展性**：设计组件时需考虑未来的扩展性，通过插槽（Children/Slots）或灵活的配置项来适应不同业务场景的需求。

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
