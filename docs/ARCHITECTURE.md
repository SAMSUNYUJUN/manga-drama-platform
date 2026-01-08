# 架构设计文档

## 技术栈总览

| 层级 | 技术选型 | 版本 | 选型理由 |
|-----|---------|------|---------|
| 前端框架 | React | 19 | 主流、生态丰富、组件化 |
| 前端语言 | TypeScript | 5.x | 类型安全、代码可维护性 |
| 前端构建 | Vite | 6.x | 快速、现代化 |
| 前端样式 | SCSS | - | 支持嵌套、变量、模块化 |
| 后端框架 | NestJS | 11.x | 企业级、模块化、TypeScript原生 |
| ORM | TypeORM | 0.3.x | NestJS官方推荐、功能完善 |
| 数据库 | SQLite | 3.x | 轻量级、零配置、适合初期开发 |
| 认证 | JWT | - | 无状态、跨域友好 |
| 存储 | 阿里云OSS | - | 稳定、可扩展、成本可控 |

## 系统架构

### 整体架构图

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTP/HTTPS
       ↓
┌─────────────────────┐
│   React Frontend    │  (Port 5173 dev / 3003 prod)
│  - 页面组件          │
│  - 状态管理          │
│  - API调用           │
└──────┬──────────────┘
       │ REST API
       ↓
┌─────────────────────┐
│   NestJS Backend    │  (Port 3001 dev / 3002 prod)
│  - 业务逻辑          │
│  - 权限控制          │
│  - 任务调度          │
└──┬──────┬──────┬────┘
   │      │      │
   ↓      ↓      ↓
┌─────┐ ┌────┐ ┌──────────┐
│SQLite│ │OSS │ │AI Services│
└─────┘ └────┘ └──────────┘
                │
                ├─ 即梦API (图片)
                ├─ Sora API (视频)
                └─ LLM API (剧本解析)
```

## 后端模块设计

### 模块职责划分

| 模块 | 路径 | 职责 |
|-----|------|------|
| AuthModule | src/auth/ | 用户认证、JWT生成和验证 |
| UserModule | src/user/ | 用户CRUD、角色管理 |
| TaskModule | src/task/ | 任务生命周期管理、状态流转 |
| AssetModule | src/asset/ | 资产CRUD、查询过滤 |
| ScriptModule | src/script/ | 剧本上传、解析调度 |
| GenerationModule | src/generation/ | 图片/视频生成调度 |
| StorageModule | src/storage/ | 文件存储抽象层 |
| AIServiceModule | src/ai-service/ | AI服务封装 |
| ConfigModule | src/config/ | 环境变量配置 |
| CommonModule | src/common/ | 通用工具、装饰器、过滤器 |

### 模块依赖关系

```
AppModule
├─ ConfigModule (全局)
├─ DatabaseModule (全局)
├─ AuthModule
│  └─ UserModule
├─ TaskModule
│  ├─ UserModule
│  └─ AssetModule
├─ AssetModule
│  └─ StorageModule
├─ ScriptModule
│  ├─ TaskModule
│  ├─ AssetModule
│  └─ AIServiceModule
├─ GenerationModule
│  ├─ TaskModule
│  ├─ AssetModule
│  ├─ StorageModule
│  └─ AIServiceModule
└─ StorageModule
   └─ ConfigModule
```

### 核心模块详细设计

#### AuthModule

**职责**: 用户认证和授权

**组件**:
- AuthController: 登录、注册接口
- AuthService: 密码验证、JWT生成
- JwtStrategy: JWT token验证策略
- JwtAuthGuard: 路由守卫
- RolesGuard: 角色权限守卫

**关键流程**:
1. 用户登录 → 验证密码 → 生成JWT
2. 请求携带JWT → JwtStrategy验证 → 注入user对象
3. RolesGuard检查用户角色 → 允许/拒绝访问

#### TaskModule

**职责**: 任务管理和流程控制

**组件**:
- TaskController: 任务CRUD接口
- TaskService: 任务逻辑、状态管理
- TaskVersionService: 版本管理

**关键方法**:
- createTask(): 创建任务和初始版本
- updateStage(): 更新任务阶段
- createNewVersion(): 创建新版本
- switchVersion(): 切换活跃版本

#### GenerationModule

**职责**: 协调AI生成流程

**子模块**:
- ImageGeneration: 图片生成调度
- VideoGeneration: 视频生成调度
- StoryboardGeneration: 分镜脚本生成

**流程**:
1. 接收生成请求
2. 调用AIServiceModule
3. 轮询/Webhook获取结果
4. 保存到StorageModule
5. 创建Asset记录

#### AIServiceModule

**职责**: 封装AI服务API

**子模块**:
- JimengService: 即梦API封装
- SoraService: Sora API封装
- LLMService: LLM API封装

**设计原则**:
- 统一接口：所有服务实现相同接口
- 错误处理：统一的错误捕获和重试
- 状态追踪：记录请求ID和状态

#### StorageModule

**职责**: 文件存储抽象

**接口设计**:
```
IStorageService {
  upload(file: Buffer, path: string): Promise<string>
  download(path: string): Promise<Buffer>
  delete(path: string): Promise<void>
  getUrl(path: string): string
}
```

**实现类**:
- OSSStorageService: 阿里云OSS实现
- LocalStorageService: 本地文件系统实现（开发用）

## 前端架构设计

### 目录结构

```
src/
├── components/         # 通用组件
│   ├── Layout/        # 布局组件
│   ├── Auth/          # 认证组件
│   ├── Common/        # 通用UI组件
│   ├── AssetCard/     # 资产卡片
│   └── TaskCard/      # 任务卡片
├── pages/             # 页面组件
│   ├── Auth/          # 登录注册
│   ├── Dashboard/     # 仪表板
│   ├── TaskList/      # 任务列表
│   ├── TaskDetail/    # 任务详情
│   ├── ScriptUpload/  # 剧本上传
│   ├── StoryboardGen/ # 分镜生成
│   ├── CharacterDesign/ # 角色定妆
│   ├── KeyframeGen/   # 关键帧生成
│   ├── VideoGen/      # 视频生成
│   └── AssetManage/   # 资产管理
├── hooks/             # 自定义Hooks
│   ├── useAuth.ts
│   ├── useTask.ts
│   └── useAsset.ts
├── services/          # API服务
│   ├── api.ts         # Axios实例
│   ├── auth.ts
│   ├── task.ts
│   ├── asset.ts
│   └── generation.ts
├── store/             # 状态管理（可选）
├── types/             # TypeScript类型
├── utils/             # 工具函数
└── styles/            # 全局样式
```

### 路由设计

| 路由 | 页面 | 权限 |
|-----|------|------|
| /login | 登录 | 公开 |
| /register | 注册 | 公开 |
| / | 重定向到 /dashboard | 需认证 |
| /dashboard | 仪表板 | 需认证 |
| /tasks | 任务列表 | 需认证 |
| /tasks/:id | 任务详情 | 需认证+所有权 |
| /tasks/:id/script | 剧本上传 | 需认证+所有权 |
| /tasks/:id/storyboard | 分镜生成 | 需认证+所有权 |
| /tasks/:id/character | 角色定妆 | 需认证+所有权 |
| /tasks/:id/keyframe | 关键帧生成 | 需认证+所有权 |
| /tasks/:id/video | 视频生成 | 需认证+所有权 |
| /assets | 资产管理 | 需认证 |
| /admin | 管理后台 | 需管理员 |

### 数据流

```
用户操作 → 事件处理 → API调用 → 更新本地状态 → 重新渲染
                              ↓
                         后端处理
                              ↓
                         返回结果
```

## 数据库设计概览

**详见**: [DATABASE_DESIGN.md](DATABASE_DESIGN.md)

核心表:
- users: 用户信息
- tasks: 任务信息
- task_versions: 任务版本
- assets: 资产记录

## API设计概览

**详见**: [API_DESIGN.md](API_DESIGN.md)

统一响应格式:
```
{
  "success": true/false,
  "data": {},
  "message": "操作成功",
  "error": null
}
```

## 关键技术决策

### 为什么选择SQLite?

**优点**:
- 零配置、快速启动
- 适合单机部署
- 足够支撑中小规模数据

**迁移路径**:
- TypeORM支持，可平滑迁移到PostgreSQL/MySQL

### 为什么选择OSS?

**优点**:
- 存储量大、成本低
- CDN加速
- 稳定可靠

**抽象层设计**:
- 通过IStorageService接口解耦
- 可切换到其他对象存储服务

### 为什么选择JWT?

**优点**:
- 无状态、易扩展
- 跨域友好
- 适合前后端分离

**安全措施**:
- HTTPS传输
- 短期过期时间
- 刷新机制（可扩展）

## 部署架构

### 开发环境

```
Frontend: http://localhost:5173 (Vite dev server)
Backend: http://localhost:3001 (NestJS dev mode)
Database: ./service/database.sqlite
Storage: 本地文件系统
```

### 生产环境

```
Frontend: http://domain:3003 (Vite preview / Nginx)
Backend: http://domain:3002 (PM2管理)
Database: ./service/database.sqlite
Storage: 阿里云OSS
```

## 扩展性考虑

### 水平扩展

- 前端: 静态资源CDN分发
- 后端: 多实例+负载均衡（需迁移到Redis Session或保持JWT）
- 数据库: SQLite迁移到PostgreSQL集群

### 功能扩展

- 任务队列: 引入BullMQ处理异步任务
- 实时通知: WebSocket推送生成进度
- 缓存层: Redis缓存热数据
- 日志系统: ELK stack
- 监控告警: Prometheus + Grafana
