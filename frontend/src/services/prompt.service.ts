/**
 * Prompt service
 * @module services/prompt
 */

import api from './api';
import type { ApiResponse } from '@shared/types/api.types';
import type { PromptTemplate, PromptTemplateVersion } from '@shared/types/prompt.types';

export const listPrompts = async (): Promise<PromptTemplate[]> => {
  const response = await api.get<ApiResponse<PromptTemplate[]>>('/prompts');
  return response.data.data || [];
};

export const createPrompt = async (payload: {
  name: string;
  description?: string;
  content?: string;
}): Promise<PromptTemplate> => {
  const response = await api.post<ApiResponse<PromptTemplate>>('/prompts', payload);
  return response.data.data!;
};

export const getPrompt = async (id: number): Promise<PromptTemplate> => {
  const response = await api.get<ApiResponse<PromptTemplate>>(`/prompts/${id}`);
  return response.data.data!;
};

export const deletePrompt = async (id: number): Promise<{ id: number }> => {
  const response = await api.delete<ApiResponse<{ id: number }>>(`/prompts/${id}`);
  return response.data.data!;
};

export const listPromptVersions = async (id: number): Promise<PromptTemplateVersion[]> => {
  const response = await api.get<ApiResponse<PromptTemplateVersion[]>>(`/prompts/${id}/versions`);
  return response.data.data || [];
};

export const getPromptVersion = async (
  id: number,
  versionId: number,
): Promise<PromptTemplateVersion> => {
  const response = await api.get<ApiResponse<PromptTemplateVersion>>(
    `/prompts/${id}/versions/${versionId}`,
  );
  return response.data.data!;
};

export const createPromptVersion = async (
  id: number,
  payload: { content: string; name: string },
): Promise<PromptTemplateVersion> => {
  const response = await api.post<ApiResponse<PromptTemplateVersion>>(`/prompts/${id}/versions`, payload);
  return response.data.data!;
};

export const updatePromptVersion = async (
  id: number,
  versionId: number,
  payload: { name?: string | null },
): Promise<PromptTemplateVersion> => {
  const response = await api.patch<ApiResponse<PromptTemplateVersion>>(
    `/prompts/${id}/versions/${versionId}`,
    payload,
  );
  return response.data.data!;
};

export const deletePromptVersion = async (
  id: number,
  versionId: number,
): Promise<{ id: number }> => {
  const response = await api.delete<ApiResponse<{ id: number }>>(`/prompts/${id}/versions/${versionId}`);
  return response.data.data!;
};

export const renderPrompt = async (
  templateVersionId: number,
  variables: Record<string, string>,
) => {
  const response = await api.post<ApiResponse<{ rendered: string; missingVariables: string[] }>>(
    '/prompts/render',
    { templateVersionId, variables },
  );
  return response.data.data!;
};
