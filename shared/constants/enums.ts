/**
 * 共享枚举定义
 * @module shared/constants/enums
 */

/**
 * 用户角色枚举
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * 任务阶段枚举
 */
export enum TaskStage {
  SCRIPT_UPLOADED = 'SCRIPT_UPLOADED',
  STORYBOARD_GENERATED = 'STORYBOARD_GENERATED',
  CHARACTER_DESIGNED = 'CHARACTER_DESIGNED',
  SCENE_GENERATED = 'SCENE_GENERATED',
  KEYFRAME_GENERATING = 'KEYFRAME_GENERATING',
  KEYFRAME_COMPLETED = 'KEYFRAME_COMPLETED',
  VIDEO_GENERATING = 'VIDEO_GENERATING',
  VIDEO_COMPLETED = 'VIDEO_COMPLETED',
  FINAL_COMPOSING = 'FINAL_COMPOSING',
  COMPLETED = 'COMPLETED',
}

/**
 * 资产类型枚举
 */
export enum AssetType {
  ORIGINAL_SCRIPT = 'original_script',
  STORYBOARD_SCRIPT = 'storyboard_script',
  CHARACTER_DESIGN = 'character_design',
  SCENE_IMAGE = 'scene_image',
  KEYFRAME_IMAGE = 'keyframe_image',
  STORYBOARD_VIDEO = 'storyboard_video',
  FINAL_VIDEO = 'final_video',
}
