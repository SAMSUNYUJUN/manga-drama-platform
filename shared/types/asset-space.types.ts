/**
 * 资产空间类型定义
 * @module shared/types/asset-space
 */

export interface AssetSpace {
  id: number;
  name: string;
  description?: string | null;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAssetSpaceDto {
  name: string;
  description?: string;
}
