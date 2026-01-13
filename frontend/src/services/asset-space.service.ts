/**
 * Asset space service
 * @module services/asset-space
 */

import api from './api';
import type { ApiResponse } from '@shared/types/api.types';
import type { AssetSpace } from '@shared/types/asset-space.types';
import type { Asset } from '@shared/types/asset.types';

export const listAssetSpaces = async (): Promise<AssetSpace[]> => {
  const response = await api.get<ApiResponse<AssetSpace[]>>('/asset-spaces');
  return response.data.data || [];
};

export const createAssetSpace = async (payload: { name: string; description?: string }): Promise<AssetSpace> => {
  const response = await api.post<ApiResponse<AssetSpace>>('/asset-spaces', payload);
  return response.data.data!;
};

export const deleteAssetSpace = async (id: number): Promise<void> => {
  await api.delete(`/asset-spaces/${id}`);
};

export const uploadAssetsToSpace = async (spaceId: number, files: File[]): Promise<Asset[]> => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  const response = await api.post<ApiResponse<Asset[]>>(`/asset-spaces/${spaceId}/upload`, formData);
  return response.data.data || [];
};
