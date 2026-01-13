/**
 * 资产相关类型定义
 * @module shared/types/asset
 */

import { AssetStatus, AssetType } from '../constants/enums';

/**
 * 资产基础信息
 */
export interface Asset {
  id: number;
  taskId?: number | null;
  spaceId?: number | null;
  versionId?: number | null;
  type: AssetType;
  url: string;
  filename: string;
  filesize?: number;
  mimeType?: string;
  status: AssetStatus;
  replacedById?: number | null;
  trashedAt?: Date | null;
  metadata?: AssetMetadata;
  createdAt: Date;
}

/**
 * 资产元数据
 */
export interface AssetMetadata {
  index?: number;
  duration?: number;
  prompt?: string;
  aiRequestId?: string;
  retryCount?: number;
  originalAssetId?: number;
  width?: number;
  height?: number;
  status?: string;
  [key: string]: any;
}

/**
 * 查询资产DTO
 */
export interface QueryAssetDto {
  taskId?: number;
  spaceId?: number;
  versionId?: number;
  type?: AssetType;
  status?: AssetStatus;
  page?: number;
  limit?: number;
}

/**
 * 文件上传响应
 */
export interface FileUploadResponse {
  url: string;
  filename: string;
  size: number;
}
