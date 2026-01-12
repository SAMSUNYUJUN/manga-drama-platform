# 变更记录

## [2026-01-13] - 工作流强类型变量系统与断点增强

### ✨ 新增功能

- ✅ Start/End 节点自动补齐与不可删除
- ✅ 节点 inputs/outputs 变量系统与类型约束连线
- ✅ 工作流 validate 接口（保存/运行前校验）
- ✅ HUMAN_BREAKPOINT 节点与 human-select 行为
- ✅ TrashAsset 记录与 24h 自动清理
- ✅ 节点测试与工作流测试入口

### 🧪 测试

- 添加校验服务单元测试
- 添加 human breakpoint 暂停/恢复集成测试

### 📝 文档更新

- 更新 ARCHITECTURE.md（变量系统与节点类型）
- 更新 API_DESIGN.md（新增接口）
- 更新 DATABASE_DESIGN.md（TrashAsset 表）

## [2026-01-12] - 工作流与AI配置基础落地

### ✨ 新增功能

- ✅ 工作流模板与版本（WorkflowTemplate/Version）
- ✅ 工作流执行与节点运行持久化（WorkflowRun/NodeRun）
- ✅ 人工断点审核与可追溯决策（HumanReviewDecision）
- ✅ Prompt 模板与版本管理（PromptTemplate/Version）
- ✅ Provider + 全局配置后台管理（Admin）
- ✅ 资产生命周期（ACTIVE/REJECTED/TRASHED/REPLACED）
- ✅ Script 上传与解析新接口
- ✅ AI Mock/Live 编排与多策略输出解析
- ✅ 任务版本锁并发控制

### 🧪 测试

- 添加并发锁单元测试
- 添加 Live AI 冒烟测试（可跳过）

### 📝 文档更新

- 更新 ARCHITECTURE.md（工作流映射）
- 更新 API_DESIGN.md（新增接口）
- 更新 summarize.md 作为初始化说明

## [2026-01-08] - 骨架优先开发完成

### ✨ 新增功能

**共享类型层**
- 创建 `/shared` 目录，实现前后端类型共享
- 定义核心类型：User, Task, TaskVersion, Asset
- 定义枚举常量：UserRole, TaskStatus, TaskStage, AssetType
- 定义API响应类型：ApiResponse, PaginatedResponse
- 实现共享工具函数：验证器

**后端核心模块**
- ✅ 实现数据库实体（User, Task, TaskVersion, Asset）
- ✅ 实现认证模块（注册、登录、JWT认证）
- ✅ 实现用户模块（基础CRUD，权限控制）
- ✅ 实现任务模块（基础CRUD，版本管理框架）
- ✅ 实现资产模块（基础查询）
- ✅ 配置全局JWT守卫
- ✅ 配置CORS和全局前缀

**前端核心模块**
- ✅ 实现API服务层（Axios配置，拦截器，错误处理）
- ✅ 实现认证Hook（useAuth，Context + useState）
- ✅ 实现登录和注册页面
- ✅ 实现布局组件（MainLayout, Navbar, Sidebar）
- ✅ 实现核心页面骨架（Dashboard, TaskList, TaskDetail）
- ✅ 配置React Router路由
- ✅ 实现受保护路由组件

### 🔧 技术配置

**前后端类型共享**
- 使用 `tsconfig-paths` 实现 `@shared` 别名
- 后端：在 `main.ts` 中注册 `tsconfig-paths/register`
- 前端：在 `vite.config.ts` 中配置 `resolve.alias`

**环境配置**
- 后端：创建 `.env` 配置文件模板
- 前端：创建 `.env` 配置文件模板
- 配置开发环境端口：前端5173，后端3001

### 📝 文档更新

- 更新 `TODO.md`，调整为骨架优先的开发结构
- 创建本变更记录文档

### 🐛 修复

- 修复 JwtModule 的 `expiresIn` 类型问题
- 修复 Entity 中 `metadataJson` 字段的 null 类型定义

### 🎯 当前项目状态

**已完成骨架**：
- ✅ 前后端完整的认证流程
- ✅ 任务的基础CRUD功能
- ✅ 用户管理基础功能
- ✅ 资产查询基础功能
- ✅ 前端路由和页面骨架

**待完善功能**（Phase 5）：
- 业务逻辑细化（版本切换、复杂状态流转）
- AI服务集成（剧本解析、图片生成、视频生成）
- UI/UX优化（遵循设计规范）
- 错误处理和边界情况
- 性能优化和测试覆盖

---

## 历史版本

### [2026-01-07] - 项目初始化

- 创建前后端项目结构
- 配置基础开发环境
- 建立文档体系
