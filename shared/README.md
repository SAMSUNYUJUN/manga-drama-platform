# Shared Module

前后端共享的类型定义、常量和工具函数。

## 目录结构

```
/shared
├── types/          # 共享类型定义
│   ├── user.types.ts
│   ├── task.types.ts
│   ├── asset.types.ts
│   ├── api.types.ts
│   └── index.ts
├── constants/      # 共享常量
│   ├── enums.ts
│   ├── config.ts
│   └── index.ts
├── utils/          # 共享工具函数
│   ├── validators.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── index.ts
```

## 使用方式

### 后端（NestJS）

```typescript
import { User, UserRole, CreateTaskDto } from '@shared/types';
import { TaskStatus, AssetType } from '@shared/constants';
import { isValidEmail } from '@shared/utils';
```

### 前端（React）

```typescript
import { User, ApiResponse, PaginatedResponse } from '@shared/types';
import { TaskStatus, PAGINATION } from '@shared/constants';
import { isValidPassword } from '@shared/utils';
```

## 配置说明

使用 `tsconfig-paths` 方案：
- 前端：在 `vite.config.ts` 配置 alias
- 后端：使用 `tsconfig-paths/register` 或在启动脚本中注册
