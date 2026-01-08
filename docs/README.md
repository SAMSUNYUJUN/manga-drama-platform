# 漫剧生产平台 - 文档导航

## 文档使用指南

**面向AI开发者**: 本文档体系作为AI Agent的持续学习和参考资料，每次开发会话开始时应阅读相关文档。在前端开发中，请严格遵循 **高端、简约、具有设计感** 的视觉风格，并确保代码 **良好封装、具有高可读性和可维护性**。

## 必读文档（按优先级）

### 1. 业务和架构理解
- **[BUSINESS_LOGIC.md](BUSINESS_LOGIC.md)** - 业务流程、角色权限、状态流转
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - 技术架构、模块职责、数据流

### 2. 数据和接口设计
- **[DATABASE_DESIGN.md](DATABASE_DESIGN.md)** - 数据模型、实体关系、字段定义
- **[API_DESIGN.md](API_DESIGN.md)** - 接口规范、请求响应格式、错误码

### 3. 开发规范和实践
- **[DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)** - 代码规范、命名约定、项目结构
- **[AI_SERVICES.md](AI_SERVICES.md)** - AI服务集成、接口封装、错误处理
- **[STORAGE_GUIDE.md](STORAGE_GUIDE.md)** - 存储方案、OSS配置、文件管理

### 4. 专项文档
- **[frontend/](frontend/)** - 前端开发规范和组件指南
- **[backend/](backend/)** - 后端模块结构和数据库操作

### 5. 变更追踪
- **[CHANGELOG.md](CHANGELOG.md)** - 重要变更记录
- **[TODO.md](TODO.md)** - 待办事项和开发计划

## AI开发会话流程

### 新会话开始
1. 阅读本文件了解文档结构
2. 根据任务类型选择相关文档阅读
3. 查看 CHANGELOG.md 了解最近变更
4. 参考 DEVELOPMENT_GUIDE.md 遵循开发规范

### 任务执行中
- 功能开发：参考 BUSINESS_LOGIC + API_DESIGN + DATABASE_DESIGN
- UI开发：参考 frontend/ 目录文档
- 后端开发：参考 backend/ 目录文档
- AI集成：参考 AI_SERVICES.md

### 任务完成后
- 更新 CHANGELOG.md 记录重要变更
- 更新相关专项文档
- 更新 TODO.md 勾选完成事项

## 项目技术栈

**前端**: React 19 + TypeScript + SCSS + Vite  
**后端**: NestJS + TypeScript + TypeORM  
**数据库**: SQLite  
**存储**: 阿里云OSS  
**AI服务**: 即梦API(生图) + Sora API(生视频) + LLM API(剧本解析)  
**认证**: JWT Token

## 项目目录结构

```
manga-drama-platform/
├── frontend/           # React前端
├── service/           # NestJS后端
├── docs/              # 文档体系（当前目录）
├── scripts/           # 部署脚本
├── storage/           # 本地存储
└── README.md          # 项目简介
```

## 文档编写原则

1. **简洁高效**: 使用表格和列表，避免冗长描述
2. **结构化**: 清晰的分类和索引
3. **面向AI**: 优化token使用，避免伪代码
4. **实时更新**: 重要变更必须记录

## 快速查询

| 需要了解... | 查看文档 |
|------------|---------|
| 整体业务流程 | BUSINESS_LOGIC.md |
| 数据库表结构 | DATABASE_DESIGN.md |
| API接口定义 | API_DESIGN.md |
| 前端路由和页面 | frontend/COMPONENT_GUIDE.md |
| 后端模块职责 | backend/MODULE_STRUCTURE.md |
| 即梦/Sora API | AI_SERVICES.md |
| 文件存储方案 | STORAGE_GUIDE.md |
| 代码规范 | DEVELOPMENT_GUIDE.md |
