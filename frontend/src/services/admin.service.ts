/**
 * Admin service
 * @module services/admin
 */

import api from './api';
import type { ApiResponse } from '@shared/types/api.types';
import type { ProviderConfig, GlobalConfig } from '@shared/types/provider.types';

export const listProviders = async (): Promise<ProviderConfig[]> => {
  const response = await api.get<ApiResponse<ProviderConfig[]>>('/admin/providers');
  return response.data.data || [];
};

export const createProvider = async (payload: {
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  retryCount?: number;
  enabled?: boolean;
  models: string[];
}): Promise<ProviderConfig> => {
  const response = await api.post<ApiResponse<ProviderConfig>>('/admin/providers', payload);
  return response.data.data!;
};

export const updateProvider = async (
  id: number,
  payload: Partial<ProviderConfig> & { apiKey?: string },
): Promise<ProviderConfig> => {
  const response = await api.patch<ApiResponse<ProviderConfig>>(`/admin/providers/${id}`, payload);
  return response.data.data!;
};

export const enableProvider = async (id: number): Promise<ProviderConfig> => {
  const response = await api.post<ApiResponse<ProviderConfig>>(`/admin/providers/${id}/enable`);
  return response.data.data!;
};

export const disableProvider = async (id: number): Promise<ProviderConfig> => {
  const response = await api.post<ApiResponse<ProviderConfig>>(`/admin/providers/${id}/disable`);
  return response.data.data!;
};

export const getGlobalConfig = async (): Promise<GlobalConfig> => {
  const response = await api.get<ApiResponse<GlobalConfig>>('/admin/config');
  return response.data.data!;
};

export const updateGlobalConfig = async (payload: Partial<GlobalConfig>): Promise<GlobalConfig> => {
  const response = await api.patch<ApiResponse<GlobalConfig>>('/admin/config', payload);
  return response.data.data!;
};
