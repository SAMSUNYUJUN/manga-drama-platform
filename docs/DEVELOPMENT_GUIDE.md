# 开发规范文档

## 代码风格

### TypeScript 规范

**命名约定**:
- 类名: PascalCase (UserService, TaskController)
- 接口: PascalCase, 以I开头 (IStorageService, IUser)
- 类型别名: PascalCase (TaskStatus, AssetMetadata)
- 变量/函数: camelCase (userName, getUserById)
- 常量: UPPER_SNAKE_CASE (MAX_RETRY_COUNT, DEFAULT_PAGE_SIZE)
- 枚举: PascalCase, 成员UPPER_SNAKE_CASE (UserRole.ADMIN)
- 私有属性: 以_开头 (_password, _internalCache)

**文件命名**:
- 组件文件: PascalCase (TaskCard.tsx, Layout.tsx)
- 服务文件: kebab-case (user.service.ts, auth.service.ts)
- 工具文件: kebab-case (date-utils.ts, validation.ts)
- 类型文件: kebab-case (user.types.ts, api.types.ts)

**代码组织**:
```
每个文件按以下顺序组织：
1. Import语句（第三方 → 本地）
2. 类型定义/接口
3. 常量
4. 主要导出（类/函数）
5. 辅助函数（不导出）
```

### 注释规范

**文件头注释**:
```
/**
 * 文件说明
 * @module 模块名
 * @author 作者（可选）
 */
```

**函数注释**:
```
/**
 * 函数说明
 * @param paramName 参数说明
 * @returns 返回值说明
 */
```

**复杂逻辑注释**:
- 使用中文注释
- 说明"为什么"而不是"做什么"
- 标注TODO、FIXME、NOTE

## 后端开发规范

### 目录结构规范

**模块目录**:
```
module-name/
├── module-name.module.ts      # 模块定义
├── module-name.controller.ts  # 控制器
├── module-name.service.ts     # 服务
├── dto/                       # 数据传输对象
│   ├── create-xxx.dto.ts
│   ├── update-xxx.dto.ts
│   └── query-xxx.dto.ts
├── entities/                  # 数据库实体（可选）
│   └── xxx.entity.ts
├── guards/                    # 守卫（可选）
└── decorators/                # 装饰器（可选）
```

### NestJS 模块规范

**Controller规范**:
- 使用装饰器: @Controller, @Get, @Post, @Patch, @Delete
- 路径命名: 小写+连字符 (/api/tasks, /api/user-profile)
- 使用@Body, @Param, @Query接收参数
- 使用DTO验证请求数据
- 使用Guard进行权限控制
- 返回统一响应格式

**Service规范**:
- 业务逻辑放在Service层
- 使用@Injectable装饰器
- 依赖注入使用构造函数
- 错误使用异常抛出（HttpException）
- 事务操作使用@Transaction

**DTO规范**:
- 使用class-validator装饰器验证
- 每个字段添加验证规则
- 提供清晰的错误消息

**Entity规范**:
- 使用TypeORM装饰器
- 明确定义字段类型和约束
- 添加索引@Index
- 定义关系@ManyToOne, @OneToMany

### 错误处理

**异常类型**:
- BadRequestException: 请求参数错误
- UnauthorizedException: 未认证
- ForbiddenException: 无权限
- NotFoundException: 资源不存在
- ConflictException: 资源冲突
- InternalServerErrorException: 服务器错误

**错误抛出**:
```
throw new BadRequestException('错误描述');
throw new NotFoundException(`任务 ${id} 不存在`);
```

**全局异常过滤器**:
- 在common/filters/定义
- 统一处理异常格式
- 记录错误日志

### 数据库操作规范

**查询规范**:
- 使用Repository模式
- 避免N+1查询，使用JOIN
- 分页使用take/skip
- 使用QueryBuilder处理复杂查询

**事务规范**:
- 多表操作必须使用事务
- 使用@Transaction装饰器或QueryRunner
- 确保事务回滚

**迁移规范**:
- 每次Schema变更创建迁移
- 迁移文件不可修改，只能新增
- 测试迁移的up和down

## 前端开发规范

### 组件规范

**组件分类**:
- 页面组件: pages/ 目录
- 布局组件: components/Layout/
- 业务组件: components/ 目录
- 通用组件: components/Common/

**组件结构**:
```
ComponentName/
├── ComponentName.tsx         # 组件主文件
├── ComponentName.scss        # 样式文件
├── index.ts                  # 导出文件
└── types.ts                  # 类型定义（可选）
```

**组件命名**:
- 函数组件使用 const + 箭头函数
- Props接口命名: ComponentNameProps
- 导出使用命名导出

**Hooks使用**:
- useState: 局部状态
- useEffect: 副作用（清理依赖）
- useCallback: 函数缓存
- useMemo: 计算缓存
- 自定义Hook: use开头 (useAuth, useTask)

### 样式规范

**SCSS规范**:
- 使用BEM命名: .block__element--modifier
- 嵌套不超过3层
- 使用变量定义颜色、字体
- 使用mixin定义可复用样式

**CSS变量**:
```
:root {
  --primary-color: #1890ff;
  --danger-color: #ff4d4f;
  --success-color: #52c41a;
  --border-radius: 4px;
  --spacing-unit: 8px;
}
```

**响应式设计**:
```
断点定义:
- mobile: < 768px
- tablet: 768px - 1024px
- desktop: > 1024px
```

### API调用规范

**Axios配置**:
- 统一的baseURL
- 请求拦截器：添加Token
- 响应拦截器：统一错误处理
- 超时设置：10s

**API Service结构**:
```
api.ts - Axios实例配置
auth.ts - 认证相关API
task.ts - 任务相关API
asset.ts - 资产相关API
generation.ts - 生成相关API
```

**错误处理**:
- 全局错误提示
- 401自动跳转登录
- 网络错误提示

### 状态管理（可选）

**推荐方案**: React Context + useReducer

**状态分类**:
- 全局状态: 用户信息、认证状态
- 页面状态: 任务列表、筛选条件
- 组件状态: 表单输入、UI状态

## 环境变量管理

### 后端环境变量

**文件位置**: service/.env

**必需变量**:
```
NODE_ENV=development
PORT=3001
JWT_SECRET=your-secret-key
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
OSS_BUCKET=xxx
OSS_REGION=xxx
JIMENG_API_KEY=xxx
SORA_API_KEY=xxx
LLM_API_KEY=xxx
```

**配置模块**:
- 使用@nestjs/config
- 类型安全的配置访问
- 验证必需变量

### 前端环境变量

**文件位置**: frontend/.env

**命名规则**: VITE_ 前缀

**示例**:
```
VITE_API_BASE_URL=http://localhost:3001/api
VITE_OSS_DOMAIN=https://oss.example.com
```

## Git 工作流

### 分支策略

- main: 生产环境代码
- develop: 开发环境代码
- feature/*: 功能分支
- bugfix/*: 修复分支
- hotfix/*: 紧急修复

### Commit 规范

**格式**: `type(scope): subject`

**类型**:
- feat: 新功能
- fix: 修复bug
- docs: 文档更新
- style: 代码格式（不影响功能）
- refactor: 重构
- test: 测试相关
- chore: 构建/工具配置

**示例**:
```
feat(task): 添加任务版本管理功能
fix(auth): 修复JWT过期未刷新问题
docs: 更新API文档
```

### PR规范

- 标题清晰描述变更
- 关联Issue编号
- 描述变更内容和影响
- 自测通过后提交

## 测试规范

### 单元测试

**后端测试**:
- 使用Jest
- Service层必须测试
- 测试文件: *.spec.ts
- 覆盖率目标: 80%

**前端测试**:
- 使用Vitest + React Testing Library
- 工具函数必须测试
- 复杂组件建议测试

### E2E测试（可选）

- 使用Playwright
- 测试关键业务流程
- 测试文件: *.e2e.spec.ts

## 性能优化

### 后端优化

- 数据库查询优化（索引、JOIN）
- 使用缓存（Redis）
- 分页加载
- 异步处理（队列）
- API响应压缩

### 前端优化

- 代码分割（lazy loading）
- 图片懒加载
- 组件缓存（React.memo）
- 防抖节流
- CDN加速

## 安全规范

### 认证安全

- 密码bcrypt加密（salt rounds: 10）
- JWT短期有效（24h）
- HTTPS传输
- XSS防护
- CSRF防护

### 数据验证

- 所有输入必须验证
- 后端验证为主
- SQL注入防护（使用ORM）
- 文件上传类型和大小限制

### 权限控制

- 每个接口检查权限
- 使用Guard统一控制
- 资源所有权验证

## 日志规范

### 日志级别

- error: 错误信息
- warn: 警告信息
- info: 重要信息
- debug: 调试信息

### 日志内容

- 请求日志: 方法、路径、参数、耗时
- 错误日志: 堆栈、上下文
- 业务日志: 关键操作记录

### 日志工具

- 使用Winston或NestJS Logger
- 日志文件轮转
- 生产环境关闭debug

## 文档维护

### 代码文档

- 复杂函数添加JSDoc
- 接口定义添加注释
- 导出类型提供说明

### 项目文档

- 重要变更更新CHANGELOG.md
- 新增API更新API_DESIGN.md
- 架构变更更新ARCHITECTURE.md
- 完成任务更新TODO.md

## 代码审查清单

- [ ] 代码符合规范
- [ ] 无console.log
- [ ] 错误处理完善
- [ ] 类型定义完整
- [ ] 注释清晰
- [ ] 测试通过
- [ ] 文档已更新
