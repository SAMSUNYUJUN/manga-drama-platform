# 项目初始化总结（架构 + 工程约束）

> 目标：用这份文件即可快速理解系统架构、工程约束与初始化步骤，避免反复查阅分散文档。

## 1. 项目定位与范围

- AI驱动的漫剧生产平台：从剧本 → 分镜 → 角色/场景 → 关键帧 → 视频 → 资产管理
- 支持任务版本管理、资产持久化、单元重试与批量重试

## 2. 技术栈与版本

- 前端：React 19 + TypeScript 5.x + Vite 6.x + SCSS
- 后端：NestJS 11.x + TypeORM 0.3.x + SQLite 3.x
- 认证：JWT
- 存储：阿里云 OSS（生产）/ 本地文件系统（开发）
- AI服务：即梦API（图像）/ Sora API（视频）/ LLM API（剧本解析）

## 3. 系统架构总览

```
Browser
  ↓ HTTP/HTTPS
React Frontend (5173 dev / 3003 prod)
  ↓ REST API
NestJS Backend (3001 dev / 3002 prod)
  ↓
SQLite / OSS / AI Services
```

- 前端负责页面、状态管理与API调用
- 后端负责业务逻辑、权限控制、任务调度与存储/AI编排

## 4. 项目结构（关键目录）

```
manga-drama-platform/
├── frontend/                 # React前端
├── service/                  # NestJS后端
├── docs/                     # 设计/规范文档
├── scripts/                  # 部署脚本
├── storage/                  # 本地临时存储
├── ecosystem.config.js       # PM2配置
└── summarize.md              # 本文件
```

## 5. 业务流程与阶段约束

### 5.1 生产流程

```
剧本上传 → LLM解析 → 分镜脚本 → 角色定妆 → 场景图 → 关键帧 → 视频 → 最终合成
```

### 5.2 阶段定义（不可跳过，线性推进）

| 阶段 | 标识 | 产出 |
| --- | --- | --- |
| 1 | SCRIPT_UPLOADED | original_script |
| 2 | STORYBOARD_GENERATED | storyboard_script |
| 3 | CHARACTER_DESIGNED | character_design |
| 4 | SCENE_GENERATED | scene_image |
| 5 | KEYFRAME_GENERATING | - |
| 6 | KEYFRAME_COMPLETED | keyframe_image |
| 7 | VIDEO_GENERATING | - |
| 8 | VIDEO_COMPLETED | storyboard_video |
| 9 | FINAL_COMPOSING | - |
| 10 | COMPLETED | final_video |

### 5.3 关键业务约束

- 线性流程：必须按阶段顺序推进
- 并发控制：同一任务同时只能执行一个生成操作
- 资产持久化：所有生成资产永久保留
- 版本隔离：不同版本资产互不影响
- 重试限制：单资产最多重试 3 次
- 分镜时长：单个分镜视频 ≤ 15 秒

## 6. 后端模块划分（NestJS）

### 6.1 模块职责

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| AuthModule | src/auth/ | 认证与JWT |
| UserModule | src/user/ | 用户CRUD与角色 |
| TaskModule | src/task/ | 任务与版本管理 |
| AssetModule | src/asset/ | 资产管理 |
| ScriptModule | src/script/ | 剧本上传与解析 |
| GenerationModule | src/generation/ | AI生成调度 |
| StorageModule | src/storage/ | 存储抽象层 |
| AIServiceModule | src/ai-service/ | AI服务封装 |
| ConfigModule | src/config/ | 配置管理 |
| DatabaseModule | src/database/ | 数据库配置 |
| CommonModule | src/common/ | 通用工具 |

### 6.2 模块依赖

```
AppModule
├─ ConfigModule (全局)
├─ DatabaseModule (全局)
├─ AuthModule → UserModule
├─ TaskModule → UserModule, AssetModule
├─ AssetModule → StorageModule
├─ ScriptModule → TaskModule, AssetModule, AIServiceModule
├─ GenerationModule → TaskModule, AssetModule, StorageModule, AIServiceModule
└─ StorageModule → ConfigModule
```

## 7. 前端结构与路由

### 7.1 目录结构

```
src/
├── components/    # 通用/业务组件
├── pages/         # 页面组件
├── hooks/         # 自定义Hook
├── services/      # API服务
├── types/         # 类型定义
├── utils/         # 工具函数
└── styles/        # 全局样式
```

### 7.2 路由

- /login, /register
- /dashboard
- /tasks, /tasks/:id
- /tasks/:id/script
- /tasks/:id/storyboard
- /tasks/:id/character
- /tasks/:id/keyframe
- /tasks/:id/video
- /assets
- /admin

### 7.3 UI/UX 设计硬约束

- 风格：高端、简约、设计感（大量留白、明确排版层级）
- 颜色：中性色为主 + 品牌强调色，避免高饱和杂色
- 动效：细腻、平滑过渡与微交互
- 工程：组件化、可读性与可维护性优先

## 8. 数据库设计（SQLite）

### 8.1 核心表

- users：用户信息（username/email唯一、bcrypt密码）
- tasks：任务信息（状态、阶段、当前版本）
- task_versions：任务版本（version递增、阶段、metadata）
- assets：资产记录（类型、URL、元数据）

### 8.2 关键枚举

- UserRole：ADMIN / USER
- TaskStatus：PENDING / PROCESSING / PAUSED / COMPLETED / FAILED / CANCELLED
- TaskStage：SCRIPT_UPLOADED → COMPLETED
- AssetType：original_script / storyboard_script / character_design / scene_image / keyframe_image / storyboard_video / final_video

## 9. API 约定

- Base URL：`http://domain:3002/api`
- 认证：Bearer Token (JWT)
- 统一响应格式：
```
{
  "success": true,
  "data": {},
  "message": "操作成功"
}
```
- 错误码：UNAUTHORIZED / FORBIDDEN / NOT_FOUND / VALIDATION_ERROR / DUPLICATE_ERROR / SERVER_ERROR / AI_SERVICE_ERROR / STORAGE_ERROR

## 10. 存储架构

### 10.1 类型

- 结构化数据：SQLite
- 文件数据：OSS（生产）/ 本地（开发）
- 临时数据：`./storage/uploads`, `./storage/temp`, `./storage/cache`

### 10.2 OSS目录规范

```
users/{userId}/tasks/{taskId}/versions/{versionId}/{type}/{filename}
```

### 10.3 上传限制

- 单文件最大：100MB
- 允许类型：jpg, jpeg, png, mp4, pdf, txt, doc, docx
- 并发上传：3个/用户

### 10.4 配额限制

- 单用户：10GB
- 单任务：1GB

## 11. AI 服务封装约束

### 11.1 统一接口

```
IImageGenerationService: generateImage / getTaskStatus / cancelTask
IVideoGenerationService: generateVideo / getTaskStatus
ILLMService: parseScript / chat
```

### 11.2 重试与超时

- 即梦API：网络/超时重试3次（2s/4s/8s）
- Sora：任务超时 60分钟，状态轮询 30s
- LLM：脚本长度限制 10000 字符，超长分段

## 12. 工程规范与限制

### 12.1 命名与文件约束

- 类/接口/类型：PascalCase（接口前缀I）
- 函数/变量：camelCase
- 常量：UPPER_SNAKE_CASE
- 组件文件：PascalCase
- 服务/工具/类型文件：kebab-case
- 私有字段：下划线前缀

### 12.2 代码组织

文件内顺序：imports → types → constants → exports → helpers

### 12.3 后端开发规范

- Controller：DTO校验、权限Guard、统一响应
- Service：业务逻辑、异常抛出（NestJS异常类）
- 数据库：Repository模式，复杂查询用QueryBuilder
- 事务：多表操作必须事务
- 迁移：每次schema变更新增迁移文件，禁止修改已有迁移

### 12.4 前端规范

- 组件结构：`Component/Component.tsx + .scss + index.ts`
- SCSS：BEM命名、嵌套 ≤ 3层、CSS变量统一主题
- API：Axios统一拦截（Token、错误处理、超时10s）
- 状态：Context + useReducer 优先

### 12.5 安全与日志

- 密码：bcrypt，salt rounds=10
- JWT：24h有效
- 安全：XSS/CSRF防护、HTTPS传输
- 日志级别：error/warn/info/debug（生产禁debug）

### 12.6 测试要求

- 后端：Jest，Service层必须测，覆盖率目标80%
- 前端：Vitest + React Testing Library

### 12.7 文档更新约束

- 变更需更新对应文档（CHANGELOG / API_DESIGN / ARCHITECTURE / TODO等）

## 13. 初始化清单（从零准备）

### 13.1 环境要求

- Node.js >= 18
- npm >= 8
- 磁盘：开发 ≥ 500MB，生产 ≥ 50GB
- 内存：≥ 4GB

### 13.2 安装依赖

```
npm run install-all
```

### 13.3 配置环境变量

后端：`service/.env`
```
NODE_ENV=development
PORT=3001
JWT_SECRET=your-jwt-secret
STORAGE_TYPE=local

OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
OSS_BUCKET=xxx
OSS_REGION=xxx
OSS_ENDPOINT=xxx

JIMENG_API_KEY=xxx
SORA_API_KEY=xxx
LLM_API_KEY=xxx
```

前端：`frontend/.env`
```
VITE_API_BASE_URL=http://localhost:3001/api
VITE_OSS_DOMAIN=https://oss.example.com
```

### 13.4 启动开发环境

```
./scripts/deploy.sh dev
```

访问：
- 前端：http://localhost:5173
- 后端：http://localhost:3001

### 13.5 构建与生产

```
npm run build
npm run prod
```

生产访问：
- 前端：http://localhost:3003
- 后端：http://localhost:3002

## 14. 初始化完成验收点

- 能注册/登录并获取JWT
- 能创建任务并生成 v1 版本
- 能上传剧本文件（本地/OSS）
- 能触发解析与生成接口（Mock模式可用）
- 资产可查询、下载、权限受控

