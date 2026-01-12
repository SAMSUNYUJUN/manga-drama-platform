# 漫剧生产平台 (Manga Drama Production Platform)

AI驱动的漫剧生产平台，支持从剧本到视频的完整制作流程。

## 项目概述

本平台提供完整的漫剧生产工作流：

1. **剧本解析** - 上传剧本，AI自动解析为分镜脚本
2. **角色定妆** - AI生成角色外观定妆图
3. **场景生成** - AI生成场景背景图
4. **关键帧生成** - 批量生成分镜关键帧，支持单个重试
5. **视频生成** - 关键帧转视频，支持单个重试
6. **资产管理** - 完整的资产管理和版本控制
7. **低代码工作流** - 拖拽编排 + 人工断点
8. **Prompt管理** - 版本化 + 变量渲染
9. **Provider配置** - 可配置模型与API Key

## 技术栈

### 前端
- React 19
- TypeScript
- SCSS
- Vite

### 后端
- NestJS
- TypeORM
- SQLite
- JWT认证

### AI服务
- OpenAI-compatible 网关（LLM/图像/视频统一接入，默认 Aisonnet）
- 兼容保留：Jimeng/Sora/LLM 直连模块（可选启用）

### 存储
- 阿里云OSS (生产)
- 本地文件系统 (开发)

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 8.0.0
- PM2 (生产环境)

### 安装依赖

```bash
npm run install-all
```

### 配置环境变量

#### 后端配置

复制 `service/.env.example` 为 `service/.env` 并配置：

```bash
# 必需配置
JWT_SECRET=your-jwt-secret

# AI 网关配置（LIVE 模式）
AI_GATEWAY_BASE_URL=https://newapi.aisonnet.org/v1
AI_GATEWAY_API_KEY=sk-REPLACE_ME
```

#### 前端配置（可选）

复制 `frontend/.env.example` 为 `frontend/.env`

### 开发环境

**Windows:**
```bash
.\scripts\deploy.ps1 dev
```

**Linux/Mac:**
```bash
./scripts/deploy.sh dev
```

访问：
- 前端: http://localhost:5173
- 后端: http://localhost:3001

默认管理员账号（Seed）：
- username: admin
- password: admin123

### 生产环境

**构建项目:**
```bash
npm run build
```

**部署:**
```bash
npm run prod
```

访问：
- 前端: http://localhost:3003
- 后端: http://localhost:3002

## 测试

```bash
npm run test
LIVE_AI_TESTS=true npm run test:live
```

## 工作流编辑与测试

- 进入 `/workflows/:id/editor` 打开可视化编辑器，Start/End 节点自动存在且不可删除
- 通过“变量编辑器”配置节点 inputs/outputs（name/type/required/default）
- 连线时会进行类型检查，不匹配会提示并拒绝连接
- 点击“校验工作流/保存版本”时会执行后端校验（type mismatch / missing input / cycle 等）
- 人工断点节点（HUMAN_BREAKPOINT）执行时会暂停，执行面板可选择候选并继续
- Trash 中的资产默认保留 24h，后端定时清理
- 节点测试：在编辑器右侧 “节点测试” 面板填写 inputs 并运行
- 工作流测试：在任务执行面板填写 Start inputs 后启动运行

## 项目结构

```
manga-drama-platform/
├── frontend/              # React前端应用
│   ├── src/
│   │   ├── components/   # 通用组件
│   │   ├── pages/        # 页面组件
│   │   ├── services/     # API服务
│   │   ├── hooks/        # 自定义Hooks
│   │   └── styles/       # 样式文件
│   └── dist/             # 构建产物
├── service/              # NestJS后端应用
│   ├── src/
│   │   ├── auth/         # 认证模块
│   │   ├── user/         # 用户模块
│   │   ├── task/         # 任务模块
│   │   ├── asset/        # 资产模块
│   │   ├── script/       # 剧本处理
│   │   ├── workflow/     # 低代码工作流
│   │   ├── prompt/       # Prompt模板
│   │   ├── admin/        # Provider/全局配置
│   │   ├── storage/      # 文件存储
│   │   ├── ai-service/   # AI服务封装
│   │   ├── common/       # 通用模块
│   │   └── database/     # 数据库配置
│   └── dist/             # 构建产物
├── docs/                 # 项目文档（重要！）
│   ├── README.md         # 文档导航
│   ├── BUSINESS_LOGIC.md # 业务逻辑
│   ├── ARCHITECTURE.md   # 架构设计
│   ├── DATABASE_DESIGN.md # 数据库设计
│   ├── API_DESIGN.md     # API接口
│   ├── DEVELOPMENT_GUIDE.md # 开发规范
│   ├── AI_SERVICES.md    # AI服务集成
│   ├── STORAGE_GUIDE.md  # 存储方案
│   ├── CHANGELOG.md      # 变更日志
│   └── TODO.md           # 开发计划
├── scripts/              # 部署脚本
│   ├── deploy.ps1        # Windows脚本
│   └── deploy.sh         # Linux/Mac脚本
├── storage/              # 本地存储
├── ecosystem.config.js   # PM2配置
└── README.md             # 本文件
```

## 文档体系

**重要**: 本项目主要由AI开发，完整的文档体系位于 `docs/` 目录。

### AI开发者必读

每次开发会话开始时：

1. 阅读 **[docs/README.md](docs/README.md)** 了解文档结构
2. 根据任务类型阅读相关专项文档
3. 查看 **[docs/CHANGELOG.md](docs/CHANGELOG.md)** 了解最近变更
4. 参考 **[docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)** 遵循开发规范

### 核心文档

| 文档 | 说明 |
|-----|------|
| [BUSINESS_LOGIC.md](docs/BUSINESS_LOGIC.md) | 业务流程、角色权限、状态流转 |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技术架构、模块职责、数据流 |
| [DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) | 数据模型、实体关系、字段定义 |
| [API_DESIGN.md](docs/API_DESIGN.md) | 接口规范、请求响应格式、错误码 |
| [DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) | 代码规范、命名约定、项目结构 |
| [AI_SERVICES.md](docs/AI_SERVICES.md) | AI服务集成、接口封装、错误处理 |
| [STORAGE_GUIDE.md](docs/STORAGE_GUIDE.md) | 存储方案、OSS配置、文件管理 |

## 管理命令

### 开发环境

```bash
# Windows
.\scripts\deploy.ps1 dev          # 启动开发环境
.\scripts\deploy.ps1 dev-stop     # 停止开发环境

# Linux/Mac
./scripts/deploy.sh dev           # 启动开发环境
./scripts/deploy.sh dev-stop      # 停止开发环境
```

### 生产环境

```bash
# 部署
npm run prod

# 管理
npm run status                    # 查看状态
npm run logs                      # 查看日志
npm run restart                   # 重启服务
npm run stop                      # 停止服务
```

### 构建

```bash
npm run build                     # 构建前后端
```

### 环境检查

```bash
# Windows
.\scripts\deploy.ps1 check

# Linux/Mac
./scripts/deploy.sh check
```

## 功能特性

### 用户管理
- 用户注册和登录
- JWT认证
- 角色权限控制 (管理员/普通用户)

### 任务管理
- 创建和管理漫剧制作任务
- 任务版本控制
- 版本切换和快照恢复
- 任务状态跟踪

### 资产管理
- 按任务和类型管理资产
- 支持查询和筛选
- 资产预览和下载
- 版本关联

### AI生成
- 剧本智能解析
- 角色定妆生成
- 场景图生成
- 关键帧批量生成
- 视频批量生成
- 单个资产重试
- 生成进度查询

### 文件存储
- 阿里云OSS集成
- 本地存储支持
- 文件上传和下载
- 签名URL访问

## 开发规范

详见 [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)

### 代码风格
- TypeScript严格模式
- ESLint + Prettier
- BEM命名规范 (CSS)
- 中文注释

### Commit规范
```
feat(module): 添加新功能
fix(module): 修复问题
docs: 更新文档
style: 代码格式
refactor: 重构
test: 测试
```

## 系统要求

### 开发环境
- Windows 10/11 或 Linux/macOS
- Node.js 18.x 或更高版本
- 8GB RAM以上
- SSD硬盘推荐

### 生产环境
- Linux服务器推荐
- 2核CPU以上
- 4GB RAM以上
- 50GB磁盘空间
- 稳定的网络连接

## 故障排除

### 端口被占用

**Windows:**
```powershell
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

**Linux/Mac:**
```bash
lsof -i :3001
kill -9 <PID>
```

### 数据库迁移

```bash
cd service
npm run migration:run
```

### 清理并重装

```bash
rm -rf node_modules frontend/node_modules service/node_modules
npm run install-all
```

## 安全注意事项

1. **不要提交敏感信息**
   - .env文件已在.gitignore中
   - API密钥、密码等敏感信息仅存储在环境变量

2. **生产环境配置**
   - 修改默认JWT_SECRET
   - 启用HTTPS
   - 配置防火墙
   - 定期更新依赖

3. **数据备份**
   - 定期备份SQLite数据库
   - OSS数据跨区域备份

## 性能优化

- 数据库索引优化
- 图片CDN加速
- API响应缓存
- 前端代码分割
- 图片懒加载

## 贡献指南

1. Fork项目
2. 创建功能分支
3. 遵循开发规范
4. 更新相关文档
5. 提交Pull Request

## 许可证

MIT License

## 联系方式

如有问题请查看文档或提交Issue。

---

**提示**: 本项目采用AI驱动开发模式，完整的技术文档位于 `docs/` 目录，请务必阅读相关文档。
