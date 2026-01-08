# 存储方案文档

## 存储架构

### 存储类型

| 类型 | 用途 | 方案 |
|-----|------|------|
| 结构化数据 | 用户、任务、资产记录 | SQLite数据库 |
| 文件数据 | 图片、视频、剧本文件 | 阿里云OSS |
| 临时数据 | 上传缓存、处理中间文件 | 本地文件系统 |

### 存储分布

```
数据库(SQLite)
  └─ 元数据、关系数据

对象存储(OSS)
  └─ 永久资产文件

本地存储(./storage)
  ├─ uploads/        # 上传临时文件
  ├─ temp/           # 处理中间文件
  └─ cache/          # 缓存文件
```

## 阿里云OSS集成

### Bucket配置

**Bucket名称**: manga-drama-platform (建议)  
**区域**: 根据用户地域选择  
**访问权限**: 私有读写  
**CDN加速**: 建议开启

### 认证配置

**环境变量**:
```
OSS_ACCESS_KEY_ID=your-access-key-id
OSS_ACCESS_KEY_SECRET=your-secret-key
OSS_BUCKET=manga-drama-platform
OSS_REGION=oss-cn-hangzhou
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
```

### SDK安装

```
npm install ali-oss
```

### 目录结构

```
bucket-root/
├── users/{userId}/
│   ├── tasks/{taskId}/
│   │   ├── versions/{versionId}/
│   │   │   ├── scripts/           # 剧本文件
│   │   │   ├── storyboards/       # 分镜脚本
│   │   │   ├── characters/        # 角色定妆
│   │   │   ├── scenes/            # 场景图
│   │   │   ├── keyframes/         # 关键帧
│   │   │   └── videos/            # 视频文件
```

### 路径命名规范

**格式**: `users/{userId}/tasks/{taskId}/versions/{versionId}/{type}/{filename}`

**示例**:
```
users/1/tasks/5/versions/1/keyframes/scene_001_1234567890.jpg
users/1/tasks/5/versions/1/videos/scene_001_1234567890.mp4
```

**文件名规则**:
- 类型前缀 + 场景编号 + 时间戳 + 扩展名
- 使用小写和下划线
- 时间戳确保唯一性

## StorageModule设计

### 接口定义

```
interface IStorageService {
  upload(file: Buffer, path: string, options?: UploadOptions): Promise<string>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  deleteMultiple(paths: string[]): Promise<void>;
  exists(path: string): Promise<boolean>;
  getUrl(path: string): string;
  getSignedUrl(path: string, expiresIn: number): Promise<string>;
}

interface UploadOptions {
  contentType?: string;
  public?: boolean;
  metadata?: Record<string, string>;
}
```

### 实现类

#### OSSStorageService

**职责**: 阿里云OSS存储实现

**关键方法**:
```
upload():
  1. 初始化OSS客户端
  2. 构建完整路径
  3. 上传文件
  4. 返回访问URL

download():
  1. 获取文件流
  2. 转换为Buffer
  3. 返回数据

getSignedUrl():
  1. 生成临时访问URL
  2. 设置过期时间
  3. 返回签名URL
```

#### LocalStorageService

**职责**: 本地文件系统存储（开发用）

**存储路径**: `./storage/uploads/`

**关键方法**:
```
upload():
  1. 创建目录（如不存在）
  2. 写入文件
  3. 返回本地路径

download():
  1. 读取文件
  2. 返回Buffer

getUrl():
  1. 返回本地文件路径或HTTP路径
```

### 存储切换

**配置项**: `STORAGE_TYPE=oss|local`

**Module配置**:
```
@Module({
  providers: [
    {
      provide: 'IStorageService',
      useFactory: (configService) => {
        const type = configService.get('STORAGE_TYPE');
        return type === 'oss' 
          ? new OSSStorageService(configService)
          : new LocalStorageService(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: ['IStorageService'],
})
export class StorageModule {}
```

## 文件上传处理

### 上传流程

```
客户端 → Multer中间件 → 临时存储 → StorageService → OSS → 返回URL
```

### Multer配置

```
配置项:
- 目标目录: ./storage/uploads
- 文件名: 时间戳 + 随机字符串
- 大小限制: 100MB
- 文件类型: 图片、视频、文档
```

### 文件验证

**验证规则**:
- 文件类型白名单: .jpg, .png, .mp4, .pdf, .txt, .doc
- 文件大小限制: 根据类型设置
- 文件内容验证: 检查magic number

### 上传进度（前端）

- 使用Axios onUploadProgress
- 显示进度条
- 支持取消上传

## 访问控制

### 私有访问

- 默认所有文件私有
- 通过签名URL访问
- URL有效期: 1小时

### 公开访问（可选）

- 最终合成视频可设为公开
- 启用CDN加速
- 设置缓存策略

### 权限检查

```
访问资产前检查:
1. 用户是否登录
2. 资产是否属于该用户
3. 管理员可访问所有资产
```

## 性能优化

### 上传优化

- 分片上传（大文件）
- 断点续传
- 并发上传限制: 3个

### 下载优化

- CDN加速
- 设置合适的缓存头
- 压缩传输

### 存储优化

- 定期清理临时文件
- 压缩图片（生成缩略图）
- 视频转码优化

## 安全措施

### 访问安全

- 签名URL防盗链
- Referer白名单
- IP访问限制（可选）

### 数据安全

- 服务端加密（OSS）
- HTTPS传输
- 定期备份重要数据

### 防滥用

- 上传频率限制
- 用户存储配额
- 异常上传检测

## 费用控制

### OSS费用构成

- 存储费用: 按GB/月
- 流量费用: 按GB计费
- 请求费用: 按次数计费

### 成本优化

- 启用生命周期规则
- 冷数据归档（IA存储）
- CDN减少OSS流量
- 清理过期临时文件

### 配额管理

- 单用户存储限制: 10GB
- 单任务资产限制: 1GB
- 超限提示或付费扩容

## 监控和日志

### 监控指标

- 存储使用量
- 上传/下载流量
- API调用次数
- 错误率

### 日志记录

```
[StorageService] Upload started
  User: 1
  Task: 5
  File: scene_001.jpg
  Size: 2.5MB

[StorageService] Upload completed
  URL: https://oss.example.com/...
  Duration: 1.2s
```

## 灾难恢复

### 备份策略

- OSS跨区域复制
- 定期备份元数据（数据库）
- 关键资产本地备份

### 恢复流程

1. 识别故障范围
2. 从备份恢复数据
3. 验证数据完整性
4. 恢复服务

## 开发和测试

### 本地开发

- 使用LocalStorageService
- 模拟OSS响应
- 快速迭代

### 测试环境

- 使用独立OSS Bucket
- 定期清理测试数据
- 流量和费用隔离

### 生产环境

- 启用所有安全措施
- 监控和告警
- 定期检查和优化

## 常见问题

### 上传失败

**原因**:
- 网络问题
- 文件过大
- 认证失败
- 存储配额满

**处理**:
- 重试机制
- 友好错误提示
- 日志记录

### 访问被拒绝

**原因**:
- 签名URL过期
- 权限不足
- Bucket配置错误

**处理**:
- 刷新签名URL
- 检查权限配置
- 验证用户身份

### 存储费用异常

**原因**:
- 数据泄露或滥用
- 未清理临时文件
- 流量异常

**处理**:
- 监控告警
- 生命周期清理
- 访问控制加固

## 配置示例

### service/.env

```
# 存储类型
STORAGE_TYPE=oss

# 阿里云OSS配置
OSS_ACCESS_KEY_ID=your-access-key-id
OSS_ACCESS_KEY_SECRET=your-secret-key
OSS_BUCKET=manga-drama-platform
OSS_REGION=oss-cn-hangzhou
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
OSS_INTERNAL=false
OSS_CDN_DOMAIN=https://cdn.example.com

# 本地存储配置（开发用）
LOCAL_STORAGE_PATH=./storage/uploads
LOCAL_STORAGE_URL=http://localhost:3001/uploads

# 上传限制
UPLOAD_MAX_SIZE=104857600
UPLOAD_ALLOWED_TYPES=jpg,jpeg,png,mp4,pdf,txt,doc,docx

# 存储配额
USER_STORAGE_QUOTA=10737418240
TASK_STORAGE_QUOTA=1073741824
```

## 扩展方向

### 多云支持

- AWS S3
- 腾讯云COS
- 私有化MinIO

### 智能存储

- 自动选择最优存储类型
- 冷热数据分离
- AI预测使用模式

### 分布式存储

- 多区域部署
- 就近访问
- 容灾备份
