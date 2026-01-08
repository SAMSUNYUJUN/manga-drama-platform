# 业务逻辑文档

## 核心业务流程

### 完整生产流程

```
剧本上传 → 剧本解析(LLM) → 分镜脚本生成 → 角色定妆生成 → 场景图生成 
→ 关键帧批量生成 → 关键帧审核/重试 → 视频批量生成 → 视频审核/重试 → 最终合成
```

### 流程阶段定义

| 阶段 | 英文标识 | 说明 | 产出资产类型 |
|-----|---------|-----|------------|
| 1 | SCRIPT_UPLOADED | 剧本已上传 | original_script |
| 2 | STORYBOARD_GENERATED | 分镜脚本已生成 | storyboard_script |
| 3 | CHARACTER_DESIGNED | 角色定妆完成 | character_design |
| 4 | SCENE_GENERATED | 场景图完成 | scene_image |
| 5 | KEYFRAME_GENERATING | 关键帧生成中 | - |
| 6 | KEYFRAME_COMPLETED | 关键帧完成 | keyframe_image |
| 7 | VIDEO_GENERATING | 视频生成中 | - |
| 8 | VIDEO_COMPLETED | 视频完成 | storyboard_video |
| 9 | FINAL_COMPOSING | 最终合成中 | - |
| 10 | COMPLETED | 任务完成 | final_video |

### 任务状态流转

| 状态 | 说明 | 可转换至 |
|-----|------|---------|
| PENDING | 待开始 | PROCESSING, CANCELLED |
| PROCESSING | 处理中 | COMPLETED, FAILED, PAUSED |
| PAUSED | 已暂停 | PROCESSING, CANCELLED |
| COMPLETED | 已完成 | - |
| FAILED | 失败 | PROCESSING (重试) |
| CANCELLED | 已取消 | - |

## 用户角色和权限

### 角色定义

| 角色 | 标识 | 权限范围 |
|-----|------|---------|
| 管理员 | ADMIN | 查看所有用户任务和资产、系统管理 |
| 普通用户 | USER | 仅查看和操作自己的任务和资产 |

### 权限矩阵

| 功能 | 管理员 | 普通用户 |
|-----|-------|---------|
| 创建任务 | ✓ | ✓ |
| 查看自己的任务 | ✓ | ✓ |
| 查看他人任务 | ✓ | ✗ |
| 删除自己的任务 | ✓ | ✓ |
| 删除他人任务 | ✓ | ✗ |
| 查看自己的资产 | ✓ | ✓ |
| 查看他人资产 | ✓ | ✗ |
| 用户管理 | ✓ | ✗ |
| 系统设置 | ✓ | ✗ |

## 资产管理

### 资产类型定义

| 类型标识 | 中文名称 | 文件格式 | 说明 |
|---------|---------|---------|------|
| original_script | 原始剧本 | .txt, .pdf, .doc | 用户上传的原始剧本 |
| storyboard_script | 分镜脚本 | .json | LLM解析后的结构化分镜 |
| character_design | 角色定妆 | .jpg, .png | 角色外观参考图 |
| scene_image | 场景图 | .jpg, .png | 场景背景参考图 |
| keyframe_image | 关键帧 | .jpg, .png | 分镜关键帧图片 |
| storyboard_video | 分镜视频 | .mp4 | 单个分镜的视频 |
| final_video | 最终视频 | .mp4 | 合成后的完整视频 |

### 资产关联关系

- 一个任务(Task)包含多个资产(Asset)
- 一个任务版本(TaskVersion)包含该版本产生的所有资产
- 资产通过 taskId 和 versionId 关联到任务和版本
- 同类型资产可能有多个（如多个角色定妆图、多个关键帧）

### 资产元数据

每个资产的 metadata 字段（JSON）可能包含：

| 字段 | 说明 | 示例 |
|-----|------|------|
| index | 序号（分镜编号） | 1, 2, 3... |
| duration | 时长（秒） | 15 |
| prompt | 生成提示词 | "一个年轻男子站在..." |
| aiRequestId | AI服务请求ID | "jimeng_xxx" |
| retryCount | 重试次数 | 0, 1, 2... |
| originalAssetId | 重试前的原资产ID | 123 |
| width | 图片/视频宽度 | 1920 |
| height | 图片/视频高度 | 1080 |

## 任务版本管理

### 版本创建时机

- 用户首次创建任务时：创建 v1
- 用户修改角色定妆后重新生成：创建 v2
- 用户修改分镜脚本后重新生成：创建新版本
- 系统策略：完整重跑某个阶段时创建新版本

### 版本数据结构

| 字段 | 说明 |
|-----|------|
| version | 版本号（递增整数）|
| stage | 当前阶段标识 |
| metadata | 版本元数据（JSON）|
| createdAt | 创建时间 |

### 版本切换和恢复

- 用户可查看历史版本
- 可切换当前任务的活跃版本（currentVersionId）
- 恢复历史版本 = 基于历史版本创建新版本（不直接修改历史）

## 重试机制

### 单元重试

- 关键帧生成：支持单个分镜重新生成
- 视频生成：支持单个视频重新生成
- 重试时保留原资产，新资产关联 originalAssetId

### 批量重试

- 失败的关键帧批量重试
- 失败的视频批量重试
- 批量重试不创建新版本，在当前版本内更新

### 重试限制

- 单个资产最多重试 3 次
- 超过限制需人工介入或跳过

## 剧本解析规则

### 输入格式

- 支持纯文本、PDF、Word文档
- 提取文本内容后调用LLM

### 输出格式（分镜脚本JSON）

```
{
  "title": "剧本标题",
  "scenes": [
    {
      "index": 1,
      "duration": 15,
      "description": "场景描述",
      "characters": ["角色A", "角色B"],
      "dialogue": "对话内容",
      "visualPrompt": "画面生成提示词",
      "sceneType": "indoor/outdoor"
    }
  ],
  "characters": [
    {
      "name": "角色名",
      "description": "外观描述",
      "designPrompt": "定妆图生成提示词"
    }
  ]
}
```

### 分镜规则

- 每个分镜不超过15秒
- 自动根据剧情节奏切分
- 保留对话和场景描述

## 生成参数配置

### 图片生成参数（即梦API）

| 参数 | 可选值 | 默认值 | 说明 |
|-----|-------|-------|------|
| width | 512-2048 | 1024 | 图片宽度 |
| height | 512-2048 | 1024 | 图片高度 |
| style | realistic, anime, comic | comic | 风格 |
| quality | draft, normal, high | high | 质量 |

### 视频生成参数（Sora API）

| 参数 | 可选值 | 默认值 | 说明 |
|-----|-------|-------|------|
| duration | 5-15 | 15 | 时长（秒）|
| fps | 24, 30 | 30 | 帧率 |
| resolution | 720p, 1080p | 1080p | 分辨率 |

## 业务规则总结

1. **线性流程**：必须按阶段顺序推进，不可跳过
2. **资产持久化**：所有生成的资产永久保留
3. **版本隔离**：不同版本的资产相互独立
4. **权限控制**：用户只能操作自己的资源（管理员除外）
5. **重试追踪**：记录所有重试历史和关联关系
6. **时长限制**：单个分镜视频不超过15秒
7. **并发控制**：同一任务同时只能执行一个生成操作
