# AI 服务集成文档

## 服务概览

| 服务 | 用途 | API提供商 | 调用场景 |
|-----|------|---------|---------|
| 即梦API | 图片生成 | 即梦 | 角色定妆、场景图、关键帧 |
| Sora API | 视频生成 | OpenAI/代理 | 关键帧转视频 |
| LLM API | 文本处理 | GPT-4/Claude | 剧本解析、分镜脚本生成 |

## 模块位置

```
service/src/ai-service/
├── jimeng/
│   ├── jimeng.service.ts
│   ├── jimeng.types.ts
│   └── jimeng.config.ts
├── sora/
│   ├── sora.service.ts
│   ├── sora.types.ts
│   └── sora.config.ts
├── llm/
│   ├── llm.service.ts
│   ├── llm.types.ts
│   └── llm.config.ts
└── ai-service.module.ts
```

## 统一接口设计

### IImageGenerationService

**职责**: 图片生成服务抽象

**方法**:
```
generateImage(params): Promise<GenerateImageResponse>
getTaskStatus(requestId): Promise<TaskStatus>
cancelTask(requestId): Promise<void>
```

**参数类型**:
```
GenerateImageParams {
  prompt: string;
  width: number;
  height: number;
  style?: string;
  referenceImages?: string[];
  negativePrompt?: string;
}

GenerateImageResponse {
  requestId: string;
  status: 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
}
```

### IVideoGenerationService

**职责**: 视频生成服务抽象

**方法**:
```
generateVideo(params): Promise<GenerateVideoResponse>
getTaskStatus(requestId): Promise<TaskStatus>
```

**参数类型**:
```
GenerateVideoParams {
  imageUrl: string;
  duration: number;
  fps: number;
  resolution: string;
  motion?: 'low' | 'medium' | 'high';
}

GenerateVideoResponse {
  requestId: string;
  status: 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}
```

### ILLMService

**职责**: LLM服务抽象

**方法**:
```
parseScript(scriptText): Promise<ParseScriptResponse>
chat(messages): Promise<ChatResponse>
```

**参数类型**:
```
ParseScriptResponse {
  title: string;
  scenes: Scene[];
  characters: Character[];
}

Scene {
  index: number;
  duration: number;
  description: string;
  characters: string[];
  dialogue: string;
  visualPrompt: string;
  sceneType: 'indoor' | 'outdoor';
}

Character {
  name: string;
  description: string;
  designPrompt: string;
}
```

## 即梦API集成

### API文档地址

（待填写实际API文档地址）

### 认证方式

**方式**: API Key  
**配置**: 环境变量 JIMENG_API_KEY

### 请求格式

**Endpoint**: POST /api/v1/image/generate

**Headers**:
```
Authorization: Bearer ${JIMENG_API_KEY}
Content-Type: application/json
```

**Body**:
```
{
  "prompt": "string",
  "width": 1024,
  "height": 1024,
  "style": "comic",
  "num_images": 1
}
```

### 响应格式

**成功响应**:
```
{
  "code": 0,
  "message": "success",
  "data": {
    "task_id": "jimeng_xxx",
    "status": "processing"
  }
}
```

### 状态查询

**Endpoint**: GET /api/v1/image/task/{task_id}

**响应**:
```
{
  "code": 0,
  "data": {
    "task_id": "jimeng_xxx",
    "status": "completed",
    "images": [
      {
        "url": "https://...",
        "width": 1024,
        "height": 1024
      }
    ]
  }
}
```

### 错误处理

| 错误码 | 说明 | 处理方式 |
|-------|------|---------|
| 401 | API Key无效 | 检查配置，抛出异常 |
| 429 | 请求频率限制 | 等待重试，记录日志 |
| 500 | 服务端错误 | 重试3次，失败则记录 |

### 重试策略

- 网络错误: 重试3次，间隔 2s/4s/8s
- 超时: 60s后重试
- 频率限制: 等待指定时间后重试
- 其他错误: 不重试，直接失败

### 费用控制

- 记录每次请求的消耗
- 单用户每日限额检查
- 异常消耗告警

## Sora API集成

### API文档地址

（待填写实际API文档地址）

### 认证方式

**方式**: Bearer Token  
**配置**: 环境变量 SORA_API_KEY

### 请求格式

**Endpoint**: POST /api/v1/video/generate

**Body**:
```
{
  "image_url": "string",
  "duration": 15,
  "fps": 30,
  "resolution": "1080p",
  "motion_level": "medium"
}
```

### 响应和状态查询

类似即梦API，返回task_id，通过轮询获取结果

### 特殊处理

- 视频生成时间长（5-30分钟）
- 使用异步任务队列
- 支持Webhook回调（可选）

### 超时设置

- 请求超时: 30s
- 任务超时: 60分钟
- 状态查询间隔: 30s

## LLM API集成

### 服务选择

推荐: GPT-4 或 Claude

### 认证方式

**方式**: API Key  
**配置**: 环境变量 LLM_API_KEY

### 剧本解析Prompt设计

**System Prompt**:
```
你是一个专业的漫剧分镜师。你的任务是将剧本解析为多个分镜场景。

要求：
1. 每个场景不超过15秒
2. 提取场景描述、角色、对话
3. 生成适合AI绘画的视觉提示词
4. 识别场景类型（室内/室外）
5. 提取所有角色及其外观描述

输出格式为JSON。
```

**User Prompt**:
```
请解析以下剧本：

{scriptText}

输出JSON格式，包含：
- title: 剧本标题
- scenes: 场景数组
- characters: 角色数组
```

### 响应解析

- 提取JSON内容
- 验证字段完整性
- 字段缺失时使用默认值
- 解析失败时抛出异常

### Token消耗优化

- 剧本长度限制: 10000字符
- 超长剧本分段处理
- 缓存已解析结果

## 服务封装实现

### JimengService实现要点

```
@Injectable()
export class JimengService implements IImageGenerationService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async generateImage(params: GenerateImageParams) {
    // 1. 参数验证
    // 2. 构建请求
    // 3. 发送请求
    // 4. 错误处理
    // 5. 返回结果
  }

  async getTaskStatus(requestId: string) {
    // 轮询任务状态
  }

  private async retry(fn: Function, times: number) {
    // 重试逻辑
  }
}
```

### 通用工具方法

**重试工具**:
```
async function retryWithBackoff(
  fn: () => Promise<any>,
  maxRetries: number,
  baseDelay: number
): Promise<any>
```

**状态轮询工具**:
```
async function pollUntilComplete(
  checkFn: () => Promise<TaskStatus>,
  interval: number,
  timeout: number
): Promise<any>
```

## 错误处理策略

### 异常分类

| 异常类型 | 处理方式 |
|---------|---------|
| 网络错误 | 重试3次 |
| 认证失败 | 抛出异常，检查配置 |
| 参数错误 | 抛出异常，修正参数 |
| 频率限制 | 等待后重试 |
| 服务端错误 | 重试，记录日志 |
| 内容违规 | 记录日志，标记资产 |

### 错误日志记录

记录内容:
- 请求参数
- 错误信息
- 堆栈信息
- 时间戳
- 用户ID和任务ID

### 失败通知

- 用户界面提示
- 管理员邮件通知（可选）
- 监控告警

## 测试策略

### Mock数据

开发环境使用Mock:
```
MOCK_AI_SERVICES=true
```

Mock返回:
- 立即返回模拟结果
- 模拟不同状态（processing, completed, failed）
- 使用占位图片/视频

### 测试用例

- 正常请求流程
- 参数验证
- 错误处理
- 重试机制
- 超时处理

## 监控和日志

### 关键指标

- 请求成功率
- 平均响应时间
- 错误率（按类型）
- 费用消耗
- 并发请求数

### 日志级别

- info: 请求开始/完成
- warn: 重试、超时
- error: 请求失败

### 日志内容

```
[JimengService] Generate image started
  RequestId: req_123
  TaskId: 456
  Prompt: "..."
  
[JimengService] Generate image completed
  RequestId: req_123
  Duration: 5.2s
  ImageUrl: "..."
```

## 配置示例

### service/.env

```
# 即梦API
JIMENG_API_KEY=your-api-key
JIMENG_API_BASE_URL=https://api.jimeng.ai
JIMENG_TIMEOUT=60000

# Sora API
SORA_API_KEY=your-api-key
SORA_API_BASE_URL=https://api.sora.com
SORA_TIMEOUT=30000
SORA_TASK_TIMEOUT=3600000

# LLM API
LLM_API_KEY=your-api-key
LLM_API_BASE_URL=https://api.openai.com
LLM_MODEL=gpt-4
LLM_MAX_TOKENS=4096

# Mock模式（开发用）
MOCK_AI_SERVICES=false
```

## 未来扩展

### 支持多个提供商

- 抽象接口保持不变
- 配置切换不同实现
- 负载均衡和容错

### 批量处理优化

- 请求合并
- 并发控制
- 任务队列

### Webhook集成

- AI服务主动推送结果
- 减少轮询频率
- 降低延迟
