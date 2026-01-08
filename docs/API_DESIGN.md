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

### GET /auth/profile

**说明**: 获取当前用户信息

**请求头**: `Authorization: Bearer {token}`

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

### GET /users

**说明**: 获取用户列表（仅管理员）

**请求头**: `Authorization: Bearer {token}`

**查询参数**:
- page: number (默认1)
- limit: number (默认20)
- role: string (可选，筛选角色)

**响应**:
```
{
  "success": true,
  "data": {
    "users": [...],
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

### GET /users/:id

**说明**: 获取用户详情（仅管理员或本人）

**响应**: 同 GET /auth/profile

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
    "tasks": [...],
    "total": 50,
    "page": 1,
    "limit": 20
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

### POST /tasks/:id/switch-version

**说明**: 切换活跃版本

**请求体**:
```
{
  "versionId": 2
}
```

## 资产管理接口

### GET /assets

**说明**: 获取资产列表

**查询参数**:
- taskId: number (可选)
- versionId: number (可选)
- type: string (可选)
- page: number
- limit: number

**响应**:
```
{
  "success": true,
  "data": {
    "assets": [...],
    "total": 30,
    "page": 1,
    "limit": 20
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

### POST /script/upload

**说明**: 上传剧本文件

**请求头**: 
- `Authorization: Bearer {token}`
- `Content-Type: multipart/form-data`

**请求体**:
- file: File (剧本文件)
- taskId: number

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

### POST /script/parse

**说明**: 解析剧本生成分镜脚本

**请求体**:
```
{
  "taskId": 1,
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

### GET /script/parse-status/:requestId

**说明**: 查询解析状态

**响应**:
```
{
  "success": true,
  "data": {
    "requestId": "llm_req_xxx",
    "status": "completed",
    "result": {
      "title": "剧本标题",
      "scenes": [...]
    }
  }
}
```

## 生成相关接口

### POST /generation/character-design

**说明**: 生成角色定妆图

**请求体**:
```
{
  "taskId": 1,
  "characters": [
    {
      "name": "角色A",
      "prompt": "外观描述..."
    }
  ],
  "config": {
    "width": 1024,
    "height": 1024,
    "style": "comic"
  }
}
```

**响应**:
```
{
  "success": true,
  "data": {
    "requestId": "gen_char_xxx",
    "status": "processing"
  }
}
```

### POST /generation/scene-image

**说明**: 生成场景图

### POST /generation/keyframes

**说明**: 批量生成关键帧

**请求体**:
```
{
  "taskId": 1,
  "scenes": [
    {
      "index": 1,
      "prompt": "画面描述...",
      "referenceImages": ["url1", "url2"]
    }
  ],
  "config": {
    "width": 1024,
    "height": 1024
  }
}
```

**响应**:
```
{
  "success": true,
  "data": {
    "requestId": "gen_key_xxx",
    "totalScenes": 10,
    "status": "processing"
  }
}
```

### POST /generation/keyframes/:sceneIndex/retry

**说明**: 重新生成单个关键帧

**请求体**:
```
{
  "taskId": 1,
  "prompt": "string (可选，不提供则使用原prompt)"
}
```

### POST /generation/videos

**说明**: 批量生成视频

**请求体**:
```
{
  "taskId": 1,
  "keyframes": [
    {
      "index": 1,
      "imageAssetId": 123,
      "duration": 15
    }
  ],
  "config": {
    "fps": 30,
    "resolution": "1080p"
  }
}
```

### POST /generation/videos/:sceneIndex/retry

**说明**: 重新生成单个视频

### GET /generation/status/:requestId

**说明**: 查询生成状态

**响应**:
```
{
  "success": true,
  "data": {
    "requestId": "gen_xxx",
    "status": "completed",
    "progress": {
      "total": 10,
      "completed": 8,
      "failed": 1,
      "processing": 1
    },
    "results": [
      {
        "index": 1,
        "status": "completed",
        "assetId": 456,
        "url": "..."
      }
    ]
  }
}
```

## 存储相关接口

### POST /storage/upload

**说明**: 通用文件上传接口

**请求头**: `Content-Type: multipart/form-data`

**请求体**:
- file: File
- taskId: number (可选)
- type: string (可选，资产类型)

**响应**:
```
{
  "success": true,
  "data": {
    "url": "https://oss.example.com/...",
    "filename": "file.jpg",
    "size": 1024000
  }
}
```

### GET /storage/download/:assetId

**说明**: 下载资产文件

**响应**: 文件流或重定向到OSS URL

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
