# 后端模块结构说明

## 模块划分

### 核心业务模块

| 模块 | 路径 | 职责 |
|-----|------|------|
| AuthModule | src/auth/ | 用户认证、JWT生成 |
| UserModule | src/user/ | 用户CRUD |
| TaskModule | src/task/ | 任务管理、版本控制 |
| AssetModule | src/asset/ | 资产管理 |
| ScriptModule | src/script/ | 剧本处理 |
| GenerationModule | src/generation/ | AI生成调度 |

### 支撑模块

| 模块 | 路径 | 职责 |
|-----|------|------|
| StorageModule | src/storage/ | 文件存储抽象 |
| AIServiceModule | src/ai-service/ | AI服务封装 |
| ConfigModule | src/config/ | 配置管理 |
| DatabaseModule | src/database/ | 数据库配置 |
| CommonModule | src/common/ | 通用工具 |

## 模块开发规范

### 标准模块结构

```
module-name/
├── module-name.module.ts
├── module-name.controller.ts
├── module-name.service.ts
├── dto/
│   ├── create-xxx.dto.ts
│   └── update-xxx.dto.ts
└── guards/ (可选)
```

### Controller职责

- 处理HTTP请求
- 参数验证 (DTO)
- 调用Service
- 返回响应

### Service职责

- 业务逻辑
- 数据库操作
- 调用其他服务
- 错误处理

### DTO设计

- 使用class-validator
- 明确验证规则
- 提供清晰错误消息

## 模块依赖

遵循依赖倒置原则，高层模块不依赖低层模块。

## 错误处理

统一使用NestJS异常类，通过全局过滤器处理。
