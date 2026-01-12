# 数据库设计文档

## 技术选型

**数据库**: SQLite 3.x  
**ORM**: TypeORM 0.3.x  
**迁移管理**: TypeORM Migrations

## 数据库文件位置

**开发环境**: `service/database.sqlite`  
**生产环境**: `service/database.sqlite`

## 实体关系图

```
┌─────────┐
│  users  │
└────┬────┘
     │ 1
     │ has many
     ↓ N
┌─────────┐         ┌──────────────┐
│  tasks  │←────────│task_versions │
└────┬────┘ 1    N  └──────┬───────┘
     │ has many           │ 1
     │                    │ produces
     ↓ N                  ↓ N
┌─────────┐              │
│ assets  │←─────────────┘
└─────────┘
```

## 表结构设计

### users 表

**说明**: 用户信息表

| 字段 | 类型 | 约束 | 说明 |
|-----|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 用户ID |
| username | VARCHAR(50) | UNIQUE, NOT NULL | 用户名 |
| email | VARCHAR(100) | UNIQUE, NOT NULL | 邮箱 |
| password | VARCHAR(255) | NOT NULL | 密码哈希(bcrypt) |
| role | VARCHAR(20) | NOT NULL, DEFAULT 'USER' | 角色: ADMIN, USER |
| createdAt | DATETIME | NOT NULL | 创建时间 |
| updatedAt | DATETIME | NOT NULL | 更新时间 |

**索引**:
- idx_users_username: (username)
- idx_users_email: (email)
- idx_users_role: (role)

### tasks 表

**说明**: 任务信息表

| 字段 | 类型 | 约束 | 说明 |
|-----|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 任务ID |
| userId | INTEGER | FOREIGN KEY → users.id, NOT NULL | 所属用户ID |
| title | VARCHAR(200) | NOT NULL | 任务标题 |
| description | TEXT | NULL | 任务描述 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'PENDING' | 状态: PENDING, PROCESSING, PAUSED, COMPLETED, FAILED, CANCELLED |
| stage | VARCHAR(50) | NULL | 当前阶段，见业务逻辑文档 |
| currentVersionId | INTEGER | FOREIGN KEY → task_versions.id, NULL | 当前活跃版本ID |
| createdAt | DATETIME | NOT NULL | 创建时间 |
| updatedAt | DATETIME | NOT NULL | 更新时间 |

**索引**:
- idx_tasks_userId: (userId)
- idx_tasks_status: (status)
- idx_tasks_createdAt: (createdAt DESC)

**外键**:
- userId → users.id ON DELETE CASCADE

### task_versions 表

**说明**: 任务版本表

| 字段 | 类型 | 约束 | 说明 |
|-----|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 版本ID |
| taskId | INTEGER | FOREIGN KEY → tasks.id, NOT NULL | 所属任务ID |
| version | INTEGER | NOT NULL | 版本号（从1开始递增）|
| stage | VARCHAR(50) | NOT NULL | 该版本所处阶段 |
| metadata | TEXT | NULL | 版本元数据(JSON) |
| createdAt | DATETIME | NOT NULL | 创建时间 |

**索引**:
- idx_versions_taskId: (taskId)
- uk_versions_task_version: (taskId, version) UNIQUE

**外键**:
- taskId → tasks.id ON DELETE CASCADE

**metadata JSON结构示例**:
```
{
  "storyboardConfig": {
    "maxDuration": 15,
    "sceneCount": 10
  },
  "generationConfig": {
    "imageStyle": "comic",
    "videoResolution": "1080p"
  },
  "parentVersionId": 1,
  "note": "修改角色定妆后重新生成"
}
```

### assets 表

**说明**: 资产记录表

| 字段 | 类型 | 约束 | 说明 |
|-----|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 资产ID |
| taskId | INTEGER | FOREIGN KEY → tasks.id, NOT NULL | 所属任务ID |
| versionId | INTEGER | FOREIGN KEY → task_versions.id, NULL | 所属版本ID |
| type | VARCHAR(50) | NOT NULL | 资产类型，见业务逻辑文档 |
| url | VARCHAR(500) | NOT NULL | 文件访问URL（OSS或本地路径）|
| filename | VARCHAR(255) | NOT NULL | 原始文件名 |
| filesize | INTEGER | NULL | 文件大小(字节) |
| mimeType | VARCHAR(100) | NULL | MIME类型 |
| metadata | TEXT | NULL | 资产元数据(JSON) |
| createdAt | DATETIME | NOT NULL | 创建时间 |

**索引**:
- idx_assets_taskId: (taskId)
- idx_assets_versionId: (versionId)
- idx_assets_type: (type)
- idx_assets_createdAt: (createdAt DESC)
- idx_assets_task_type: (taskId, type)

**外键**:
- taskId → tasks.id ON DELETE CASCADE
- versionId → task_versions.id ON DELETE SET NULL

**metadata JSON结构示例**:
```
{
  "index": 1,
  "duration": 15,
  "prompt": "生成提示词...",
  "aiRequestId": "jimeng_xxx123",
  "retryCount": 0,
  "originalAssetId": null,
  "width": 1024,
  "height": 1024,
  "status": "completed"
}
```

### trash_assets 表

**说明**: 垃圾桶记录（人工断点丢弃资产与 24h 自动清理）

| 字段 | 类型 | 约束 | 说明 |
|-----|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | 记录ID |
| assetId | INTEGER | FOREIGN KEY → assets.id, NULL | 关联资产 |
| originRunId | INTEGER | NULL | 来源 WorkflowRun |
| originNodeId | VARCHAR(64) | NULL | 来源节点ID |
| metadata | TEXT | NULL | 附加信息(JSON) |
| expireAt | DATETIME | NOT NULL | 过期时间 |
| createdAt | DATETIME | NOT NULL | 创建时间 |

## 数据类型映射

### TypeORM → SQLite

| TypeORM | SQLite | 说明 |
|---------|--------|------|
| @PrimaryGeneratedColumn() | INTEGER PRIMARY KEY | 自增主键 |
| @Column('int') | INTEGER | 整数 |
| @Column('varchar') | TEXT | 字符串 |
| @Column('text') | TEXT | 长文本 |
| @Column('datetime') | TEXT | 日期时间（ISO 8601格式）|
| @Column('boolean') | INTEGER | 布尔值（0或1）|
| @Column('json') | TEXT | JSON（存储为文本）|

## 枚举定义

### UserRole

```
ADMIN = 'ADMIN'
USER = 'USER'
```

### TaskStatus

```
PENDING = 'PENDING'
PROCESSING = 'PROCESSING'
PAUSED = 'PAUSED'
COMPLETED = 'COMPLETED'
FAILED = 'FAILED'
CANCELLED = 'CANCELLED'
```

### TaskStage

```
SCRIPT_UPLOADED = 'SCRIPT_UPLOADED'
STORYBOARD_GENERATED = 'STORYBOARD_GENERATED'
CHARACTER_DESIGNED = 'CHARACTER_DESIGNED'
SCENE_GENERATED = 'SCENE_GENERATED'
KEYFRAME_GENERATING = 'KEYFRAME_GENERATING'
KEYFRAME_COMPLETED = 'KEYFRAME_COMPLETED'
VIDEO_GENERATING = 'VIDEO_GENERATING'
VIDEO_COMPLETED = 'VIDEO_COMPLETED'
FINAL_COMPOSING = 'FINAL_COMPOSING'
COMPLETED = 'COMPLETED'
```

### AssetType

```
ORIGINAL_SCRIPT = 'original_script'
STORYBOARD_SCRIPT = 'storyboard_script'
CHARACTER_DESIGN = 'character_design'
SCENE_IMAGE = 'scene_image'
KEYFRAME_IMAGE = 'keyframe_image'
STORYBOARD_VIDEO = 'storyboard_video'
FINAL_VIDEO = 'final_video'
```

## 常用查询模式

### 查询用户的所有任务

```
SELECT * FROM tasks 
WHERE userId = ? 
ORDER BY createdAt DESC
```

### 查询任务的所有资产（当前版本）

```
SELECT * FROM assets 
WHERE taskId = ? AND versionId = ?
ORDER BY type, createdAt
```

### 查询任务的所有版本

```
SELECT * FROM task_versions 
WHERE taskId = ? 
ORDER BY version DESC
```

### 查询特定类型的资产

```
SELECT * FROM assets 
WHERE taskId = ? AND type = ?
ORDER BY createdAt
```

### 管理员查询所有用户任务

```
SELECT t.*, u.username 
FROM tasks t 
JOIN users u ON t.userId = u.id 
ORDER BY t.createdAt DESC
```

## 数据迁移策略

### 初始化迁移

1. 创建所有表结构
2. 创建索引和外键约束
3. 插入默认管理员账户

### 版本迁移

- 使用 TypeORM Migrations
- 迁移文件命名: `{timestamp}-{description}.ts`
- 每次结构变更必须创建新迁移

### 迁移命令

```
生成迁移: npm run migration:generate -- -n MigrationName
运行迁移: npm run migration:run
回滚迁移: npm run migration:revert
```

## 数据完整性

### 外键约束

- 启用外键约束确保引用完整性
- 级联删除：删除用户时删除其所有任务和资产
- 设置NULL：删除版本时将资产的versionId设为NULL

### 事务处理

需要事务的操作：
- 创建任务+初始版本
- 切换版本+更新任务currentVersionId
- 批量创建资产
- 删除任务+关联数据

### 数据验证

- 应用层：使用class-validator验证DTO
- 数据库层：NOT NULL约束、UNIQUE约束
- 业务层：状态流转验证、权限检查

## 性能优化

### 索引策略

- 主键自动索引
- 外键字段创建索引
- 常用查询条件字段创建索引
- 复合索引：(taskId, type) 用于按类型查询资产

### 查询优化

- 避免SELECT *，明确指定字段
- 使用JOIN代替多次查询
- 分页查询使用LIMIT + OFFSET
- 大量数据使用流式查询

### 数据归档

- 定期归档已完成的旧任务
- 移动到历史表或导出为文件
- 保留近期活跃数据

## 备份策略

### 备份方式

- SQLite文件级备份：直接复制database.sqlite
- 定时备份：每天凌晨自动备份
- 备份保留：保留最近7天的备份

### 恢复流程

1. 停止服务
2. 替换database.sqlite文件
3. 重启服务
4. 验证数据完整性

## 迁移到其他数据库

### 迁移到PostgreSQL

1. 修改 TypeORM 配置
2. 调整数据类型（JSON、DATETIME等）
3. 运行迁移生成新表结构
4. 数据导入导出

### 兼容性考虑

- 使用TypeORM跨数据库功能
- 避免使用SQLite特定语法
- JSON字段使用TypeORM的@Column('json')
