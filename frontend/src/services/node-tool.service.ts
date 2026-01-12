/**
 * Node tool service
 * @module services/node-tool
 */

import api from './api';
import type { ApiResponse } from '@shared/types/api.types';
import type { NodeTool, NodeToolTestResult } from '@shared/types/node-tool.types';

export const listNodeTools = async (enabled?: boolean): Promise<NodeTool[]> => {
  const params = enabled === undefined ? undefined : { enabled };
  const response = await api.get<ApiResponse<NodeTool[]>>('/node-tools', { params });
  return response.data.data || [];
};

export const getNodeTool = async (id: number): Promise<NodeTool> => {
  const response = await api.get<ApiResponse<NodeTool>>(`/node-tools/${id}`);
  return response.data.data!;
};

export const createNodeTool = async (
  payload: Omit<NodeTool, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<NodeTool> => {
  const response = await api.post<ApiResponse<NodeTool>>('/node-tools', payload);
  return response.data.data!;
};

export const updateNodeTool = async (
  id: number,
  payload: Partial<Omit<NodeTool, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<NodeTool> => {
  const response = await api.patch<ApiResponse<NodeTool>>(`/node-tools/${id}`, payload);
  return response.data.data!;
};

export const deleteNodeTool = async (id: number): Promise<{ id: number }> => {
  const response = await api.delete<ApiResponse<{ id: number }>>(`/node-tools/${id}`);
  return response.data.data!;
};

export const testNodeTool = async (
  payload: { promptTemplateVersionId?: number; model?: string; inputs?: Record<string, any> },
): Promise<NodeToolTestResult> => {
  const response = await api.post<ApiResponse<NodeToolTestResult>>(
    '/node-tools/test',
    payload,
    { timeout: 60000 },
  );
  return response.data.data!;
};

export const testNodeToolById = async (
  id: number,
  inputs?: Record<string, any>,
): Promise<NodeToolTestResult> => {
  const response = await api.post<ApiResponse<NodeToolTestResult>>(
    `/node-tools/${id}/test`,
    { inputs },
    { timeout: 60000 },
  );
  return response.data.data!;
};
