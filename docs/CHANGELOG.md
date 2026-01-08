# 变更记录

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
