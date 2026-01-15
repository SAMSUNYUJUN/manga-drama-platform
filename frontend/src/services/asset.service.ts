/**
 * Asset service
 * @module services/asset
 */

import api from './api';
import type { ApiResponse, PaginatedResponse } from '@shared/types/api.types';
import type { Asset } from '@shared/types/asset.types';
import type { AssetStatus, AssetType } from '@shared/constants';

export const listAssets = async (params?: {
  taskId?: number;
  spaceId?: number;
  versionId?: number;
  type?: AssetType;
  status?: AssetStatus;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Asset>> => {
  const response = await api.get<ApiResponse<PaginatedResponse<Asset>>>('/assets', { params });
  return response.data.data!;
};

export const trashAsset = async (id: number): Promise<Asset> => {
  const response = await api.post<ApiResponse<Asset>>(`/assets/${id}/trash`);
  return response.data.data!;
};

export const restoreAsset = async (id: number): Promise<Asset> => {
  const response = await api.post<ApiResponse<Asset>>(`/assets/${id}/restore`);
  return response.data.data!;
};

export const downloadAsset = async (id: number): Promise<{ url: string }> => {
  const response = await api.get<ApiResponse<{ url: string }>>(`/assets/${id}/download`);
  return response.data.data!;
};

export const hardDeleteAsset = async (id: number, confirmToken: string): Promise<void> => {
  await api.delete(`/assets/${id}`, { params: { confirmToken } });
};

export const batchHardDeleteAssets = async (ids: number[], confirmToken: string): Promise<void> => {
  await api.post('/assets/batch-delete', { ids, confirmToken });
};

export const batchRestoreAssets = async (ids: number[]): Promise<void> => {
  await api.post('/assets/batch-restore', { ids });
};
