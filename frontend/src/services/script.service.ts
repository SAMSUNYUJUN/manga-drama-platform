/**
 * Script service
 * @module services/script
 */

import api from './api';
import type { ApiResponse } from '@shared/types/api.types';
import type { Asset } from '@shared/types/asset.types';

export const uploadScript = async (taskId: number, versionId: number, file: File): Promise<Asset> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post<ApiResponse<Asset>>(
    `/tasks/${taskId}/versions/${versionId}/script/upload`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return response.data.data!;
};

export const parseScript = async (
  taskId: number,
  versionId: number,
  payload?: { scriptAssetId?: number; scriptText?: string },
): Promise<Asset> => {
  const response = await api.post<ApiResponse<Asset>>(
    `/tasks/${taskId}/versions/${versionId}/script/parse`,
    payload || {},
  );
  return response.data.data!;
};

export const getScripts = async (taskId: number, versionId: number): Promise<Asset[]> => {
  const response = await api.get<ApiResponse<Asset[]>>(`/tasks/${taskId}/versions/${versionId}/script`);
  return response.data.data || [];
};
