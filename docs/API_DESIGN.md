# API 接口设计文档

## 基础信息

**Base URL**: `http://domain:3002/api`  
**Content-Type**: `application/json`  
**认证方式**: Bearer Token (JWT)

## 统一响应格式

### 成功响应

```
{
  "success": true,
  "data": {},
  "message": "操作成功"
}
```

### 失败响应

```
{
  "success": false,
  "data": null,
  "message": "错误描述",
  "error": {
    "code": "ERROR_CODE",
    "details": {}
  }
}
```

## 错误码定义

| 错误码 | HTTP状态 | 说明 |
|-------|---------|------|
| UNAUTHORIZED | 401 | 未认证或Token无效 |
| FORBIDDEN | 403 | 无权限访问 |
| NOT_FOUND | 404 | 资源不存在 |
| VALIDATION_ERROR | 400 | 请求参数验证失败 |
| DUPLICATE_ERROR | 409 | 资源重复（如用户名已存在）|
| SERVER_ERROR | 500 | 服务器内部错误 |
| AI_SERVICE_ERROR | 502 | AI服务调用失败 |
| STORAGE_ERROR | 503 | 存储服务错误 |

## 认证相关接口

### POST /auth/register

**说明**: 用户注册

**请求头**: 无需认证

**请求体**:
```
{
  "username": "string (3-50字符)",
  "email": "string (邮箱格式)",
  "password": "string (6-32字符)"
}
```

**响应**: 
```
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "testuser",
      "email": "test@example.com",
      "role": "USER"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### POST /auth/login

**说明**: 用户登录

**请求头**: 无需认证

**请求体**:
```
{
  "username": "string",
  "password": "string"
}
```

**响应**: 同注册接口

### GET /auth/me

**说明**: 获取当前用户信息

**请求头**: `Authorization: Bearer {token}`

**兼容**: `/auth/profile` 仍可用（历史接口）

**响应**:
```
{
  "success": true,
  "data": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com",
    "role": "USER",
    "createdAt": "2026-01-08T10:00:00Z"
  }
}
```

## 用户管理接口

> 当前仅提供用户详情 / 更新 / 删除接口，用户列表暂未开放。

### GET /users/:id

**说明**: 获取用户详情（仅管理员或本人）

**响应**: 同 GET /auth/me

### PATCH /users/:id

**说明**: 更新用户信息（仅管理员或本人）

**请求体**:
```
{
  "email": "string (可选)",
  "password": "string (可选)",
  "role": "string (仅管理员可修改)"
}
```

### DELETE /users/:id

**说明**: 删除用户（仅管理员）

**响应**:
```
{
  "success": true,
  "message": "用户删除成功"
}
```

## 任务管理接口

### POST /tasks

**说明**: 创建任务

**请求头**: `Authorization: Bearer {token}`

**请求体**:
```
{
  "title": "string (必填)",
  "description": "string (可选)"
}
```

**响应**:
```
{
  "success": true,
  "data": {
    "id": 1,
    "userId": 1,
    "title": "我的漫剧任务",
    "description": "",
    "status": "PENDING",
    "stage": null,
    "currentVersionId": 1,
    "createdAt": "2026-01-08T10:00:00Z"
  }
}
```

### GET /tasks

**说明**: 获取任务列表

**查询参数**:
- page: number
- limit: number
- status: string (可选)
- userId: number (可选，仅管理员)

**响应**:
```
{
  "success": true,
  "data": {
    "items": [...],
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

### GET /tasks/:id

**说明**: 获取任务详情

**响应**:
```
{
  "success": true,
  "data": {
    "id": 1,
    "title": "任务标题",
    "status": "PROCESSING",
    "stage": "KEYFRAME_GENERATING",
    "currentVersion": {
      "id": 1,
      "version": 1,
      "stage": "KEYFRAME_GENERATING"
    },
    "user": {
      "id": 1,
      "username": "testuser"
    },
    "versions": [...],
    "createdAt": "2026-01-08T10:00:00Z"
  }
}
```

### PATCH /tasks/:id

**说明**: 更新任务

**请求体**:
```
{
  "title": "string (可选)",
  "description": "string (可选)",
  "status": "string (可选)",
  "stage": "string (可选)"
}
```

### DELETE /tasks/:id

**说明**: 删除任务

### POST /tasks/:id/versions

**说明**: 创建新版本

**请求体**:
```
{
  "note": "string (可选)",
  "metadata": {}
}
```

**响应**:
```
{
  "success": true,
  "data": {
    "id": 2,
    "taskId": 1,
    "version": 2,
    "stage": "SCRIPT_UPLOADED",
    "createdAt": "2026-01-08T11:00:00Z"
  }
}
```

### GET /tasks/:id/versions

**说明**: 获取任务所有版本

> 说明：当前版本切换由前端选择具体版本 + 后端读取版本详情完成，不提供独立切换接口。

## 资产管理接口

### GET /assets

**说明**: 获取资产列表

**查询参数**:
- taskId: number (可选)
- versionId: number (可选)
- type: string (可选)
- status: string (可选)
- page: number
- limit: number

**响应**:
```
{
  "success": true,
  "data": {
    "items": [...],
    "total": 30,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}
```

### GET /assets/:id

**说明**: 获取资产详情

**响应**:
```
{
  "success": true,
  "data": {
    "id": 1,
    "taskId": 1,
    "versionId": 1,
    "type": "keyframe_image",
    "url": "https://oss.example.com/...",
    "filename": "scene_01.jpg",
    "filesize": 1024000,
    "mimeType": "image/jpeg",
    "metadata": {
      "index": 1,
      "prompt": "..."
    },
    "createdAt": "2026-01-08T10:00:00Z"
  }
}
```

### DELETE /assets/:id

**说明**: 删除资产

## 剧本处理接口

### POST /tasks/:id/versions/:versionId/script/upload

**说明**: 上传剧本文件

**请求头**: 
- `Authorization: Bearer {token}`
- `Content-Type: multipart/form-data`

**请求体**:
- file: File (剧本文件)

**响应**:
```
{
  "success": true,
  "data": {
    "assetId": 1,
    "filename": "script.txt",
    "url": "..."
  }
}
```

### POST /tasks/:id/versions/:versionId/script/parse

**说明**: 解析剧本生成分镜脚本

**请求体**:
```
{
  "scriptAssetId": 1,
  "config": {
    "maxDuration": 15,
    "style": "comic"
  }
}
```

**响应**:
```
{
  "success": true,
  "data": {
    "requestId": "llm_req_xxx",
    "status": "processing"
  }
}
```

### GET /tasks/:id/versions/:versionId/script

**说明**: 获取剧本资产（原始/分镜）

**响应**:
```
{
  "success": true,
  "data": {
    {
      "id": 1,
      "type": "original_script",
      "url": "..."
    }
  ]
}
```

## 生成相关接口（已废弃）

> 生成由 WorkflowRun/NodeRun 驱动，旧 `/generation/*` 端点不再提供。

## 存储相关接口（已废弃）

> 上传与下载由 Script 上传与 Assets 下载接口统一承担，不单独提供 /storage 端点。

## 请求限制

### 认证接口

- 登录/注册: 10次/分钟/IP
- 其他: 60次/分钟/用户

### 生成接口

- 批量生成: 5次/小时/用户
- 单个重试: 20次/小时/用户

### 文件上传

- 单文件大小: 最大100MB
- 并发上传: 3个/用户

## 分页规范

**默认参数**:
- page: 1
- limit: 20
- 最大limit: 100

**响应格式**:
```
{
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

## WebHook (可选扩展)

> 当前版本仅预留接口设计，未默认实现。

### POST /webhook/ai-callback

**说明**: AI服务回调接口

**请求体**:
```
{
  "requestId": "string",
  "status": "completed/failed",
  "result": {}
}
```

## 健康检查

> 当前版本未提供独立健康检查端点，可按需添加。

### GET /health

**说明**: 服务健康检查

**响应**:
```
{
  "status": "ok",
  "timestamp": "2026-01-08T10:00:00Z",
  "uptime": 3600,
  "database": "connected",
  "storage": "connected"
}
```

## 工作流模板接口

### POST /workflows/templates

创建模板

### GET /workflows/templates

获取模板列表

### GET /workflows/templates/:id

获取模板详情

### POST /workflows/templates/:id/versions

创建模板版本

### GET /workflows/templates/:id/versions

获取模板版本列表

### GET /workflows/templates/:id/versions/:versionId

获取模板版本详情

### GET /workflows/versions/:id/validate

校验指定模板版本（运行前/发布前）

### POST /workflows/validate

校验工作流（传 nodes/edges JSON）

### POST /workflows/node-test

单节点测试（输入 nodeType/config/inputs）

## 工作流运行接口

### POST /workflow-runs

创建运行（携带 taskId/taskVersionId/templateVersionId/startInputs）

### GET /workflow-runs/:id

获取运行详情

### POST /workflow-runs/:id/actions/human-select

人工断点选择（selectedIndices/selectedAssetIds）

获取模板版本详情

## 工作流运行接口

### POST /tasks/:id/versions/:versionId/workflow/run

启动工作流运行

### GET /tasks/:id/versions/:versionId/workflow/run

获取最新运行状态

### POST /workflow/runs/:runId/cancel

取消运行

### POST /workflow/runs/:runId/retry

重试运行

### GET /workflow/runs/:runId/nodes

获取节点运行列表

## 人工审核接口

### GET /workflow/node-runs/:nodeRunId/review/assets

获取待审核资产

### POST /workflow/node-runs/:nodeRunId/review/decision

提交审核决策（通过/拒绝）

### POST /workflow/node-runs/:nodeRunId/review/upload

上传替换资产

### POST /workflow/node-runs/:nodeRunId/review/continue

继续工作流

## Prompt 管理接口

### POST /prompts

创建 Prompt 模板

### GET /prompts

获取模板列表

### GET /prompts/:id

获取模板详情

### POST /prompts/:id/versions

创建模板版本

### GET /prompts/:id/versions

获取模板版本列表

### GET /prompts/:id/versions/:versionId

获取模板版本详情

### POST /prompts/render

渲染 Prompt（变量校验）

## Provider / Config 接口（管理员）

### GET /admin/providers

获取 Provider 列表

### POST /admin/providers

创建 Provider

### PATCH /admin/providers/:id

更新 Provider

### POST /admin/providers/:id/enable

启用 Provider

### POST /admin/providers/:id/disable

禁用 Provider

### GET /admin/config

获取全局配置

### PATCH /admin/config

更新全局配置

## 资产生命周期接口

### GET /assets?taskId=&versionId=&type=&status=

获取资产列表（支持状态筛选）

### GET /assets/:assetId/download

获取下载URL

### POST /assets/:assetId/trash

软删除（进入垃圾桶）

### POST /assets/:assetId/restore

恢复资产

### DELETE /assets/:assetId?confirmToken=xxx

永久删除（仅管理员）
