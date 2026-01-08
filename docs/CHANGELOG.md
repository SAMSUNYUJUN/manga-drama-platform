# 变更日志

## 记录规则

- 重要架构变更
- 数据库Schema变更
- API接口变更
- 配置项变更
- 重大Bug修复

## [Unreleased]

### 2026-01-08 - 项目初始化

**架构建立**:
- 创建前后端项目结构
- 建立文档体系
- 定义数据模型和API接口

**技术栈确定**:
- 前端: React 19 + TypeScript + SCSS + Vite
- 后端: NestJS + TypeORM + SQLite
- 存储: 阿里云OSS
- AI服务: 即梦API + Sora API + LLM API

**模块规划**:
- AuthModule: 认证和授权
- UserModule: 用户管理
- TaskModule: 任务管理
- AssetModule: 资产管理
- ScriptModule: 剧本处理
- GenerationModule: AI生成
- StorageModule: 文件存储
- AIServiceModule: AI服务封装

**数据库设计**:
- users表: 用户信息
- tasks表: 任务信息
- task_versions表: 任务版本
- assets表: 资产记录

**文档建立**:
- 业务逻辑文档
- 架构设计文档
- 数据库设计文档
- API接口文档
- 开发规范文档
- AI服务集成文档
- 存储方案文档

---

## 模板

### YYYY-MM-DD - 变更标题

**新增功能**:
- 功能描述

**变更内容**:
- 变更描述

**修复问题**:
- 问题描述

**数据库变更**:
- Schema变更说明

**API变更**:
- 接口变更说明

**配置变更**:
- 新增配置项
- 配置项说明

**影响范围**:
- 影响的模块
- 需要的迁移操作
