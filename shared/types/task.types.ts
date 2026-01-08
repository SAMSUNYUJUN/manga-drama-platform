/**
 * 任务相关类型定义
 * @module shared/types/task
 */

import { TaskStatus, TaskStage } from '../constants/enums';

/**
 * 任务基础信息
 */
export interface Task {
  id: number;
  userId: number;
  title: string;
  description?: string;
  status: TaskStatus;
  stage?: TaskStage;
  currentVersionId?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 任务版本信息
 */
export interface TaskVersion {
  id: number;
  taskId: number;
  version: number;
  stage: TaskStage;
  metadata?: TaskVersionMetadata;
  createdAt: Date;
}

/**
 * 任务版本元数据
 */
export interface TaskVersionMetadata {
  storyboardConfig?: {
    maxDuration?: number;
    sceneCount?: number;
  };
  generationConfig?: {
    imageStyle?: string;
    videoResolution?: string;
  };
  parentVersionId?: number;
  note?: string;
}

/**
 * 创建任务DTO
 */
export interface CreateTaskDto {
  title: string;
  description?: string;
}

/**
 * 更新任务DTO
 */
export interface UpdateTaskDto {
  title?: string;
  description?: string;
  status?: TaskStatus;
  stage?: TaskStage;
}

/**
 * 创建任务版本DTO
 */
export interface CreateTaskVersionDto {
  note?: string;
  metadata?: TaskVersionMetadata;
}

/**
 * 切换版本DTO
 */
export interface SwitchVersionDto {
  versionId: number;
}

/**
 * 任务详情（包含关联数据）
 */
export interface TaskDetail extends Task {
  currentVersion?: TaskVersion;
  user?: {
    id: number;
    username: string;
  };
  versions?: TaskVersion[];
}
