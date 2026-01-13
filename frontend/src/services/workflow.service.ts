/**
 * Workflow service
 * @module services/workflow
 */

import api from './api';
import type { ApiResponse } from '@shared/types/api.types';
import type { WorkflowTemplate, WorkflowTemplateVersion, WorkflowRun, NodeRun, WorkflowValidationResult, WorkflowTestResult } from '@shared/types/workflow.types';

export const listWorkflowTemplates = async (): Promise<WorkflowTemplate[]> => {
  const response = await api.get<ApiResponse<WorkflowTemplate[]>>('/workflows/templates');
  return response.data.data || [];
};

export const createWorkflowTemplate = async (
  payload: Pick<WorkflowTemplate, 'name' | 'description' | 'spaceId'>,
): Promise<WorkflowTemplate> => {
  const response = await api.post<ApiResponse<WorkflowTemplate>>('/workflows/templates', payload);
  return response.data.data!;
};

export const updateWorkflowTemplate = async (
  id: number,
  payload: Partial<Pick<WorkflowTemplate, 'name' | 'description' | 'spaceId'>>,
): Promise<WorkflowTemplate> => {
  const response = await api.patch<ApiResponse<WorkflowTemplate>>(`/workflows/templates/${id}`, payload);
  return response.data.data!;
};

export const getWorkflowTemplate = async (id: number): Promise<WorkflowTemplate> => {
  const response = await api.get<ApiResponse<WorkflowTemplate>>(`/workflows/templates/${id}`);
  return response.data.data!;
};

export const deleteWorkflowTemplate = async (id: number): Promise<{ id: number }> => {
  const response = await api.delete<ApiResponse<{ id: number }>>(`/workflows/templates/${id}`);
  return response.data.data!;
};

export const createWorkflowTemplateVersion = async (
  templateId: number,
  payload: Pick<WorkflowTemplateVersion, 'nodes' | 'edges' | 'metadata'>,
): Promise<WorkflowTemplateVersion> => {
  const response = await api.post<ApiResponse<WorkflowTemplateVersion>>(
    `/workflows/templates/${templateId}/versions`,
    payload,
  );
  return response.data.data!;
};

export const validateWorkflow = async (
  payload: Pick<WorkflowTemplateVersion, 'nodes' | 'edges' | 'metadata'>,
): Promise<WorkflowValidationResult> => {
  const response = await api.post<ApiResponse<WorkflowValidationResult>>('/workflows/validate', payload);
  return response.data.data!;
};

export const validateWorkflowVersion = async (versionId: number): Promise<WorkflowValidationResult> => {
  const response = await api.get<ApiResponse<WorkflowValidationResult>>(`/workflows/versions/${versionId}/validate`);
  return response.data.data!;
};

export const listWorkflowTemplateVersions = async (
  templateId: number,
): Promise<WorkflowTemplateVersion[]> => {
  const response = await api.get<ApiResponse<WorkflowTemplateVersion[]>>(
    `/workflows/templates/${templateId}/versions`,
  );
  return response.data.data || [];
};

export const getWorkflowTemplateVersion = async (
  templateId: number,
  versionId: number,
): Promise<WorkflowTemplateVersion> => {
  const response = await api.get<ApiResponse<WorkflowTemplateVersion>>(
    `/workflows/templates/${templateId}/versions/${versionId}`,
  );
  return response.data.data!;
};

export const startWorkflowRun = async (
  taskId: number,
  versionId: number,
  templateVersionId: number,
  startInputs?: Record<string, any>,
): Promise<WorkflowRun> => {
  const response = await api.post<ApiResponse<WorkflowRun>>(
    `/tasks/${taskId}/versions/${versionId}/workflow/run`,
    { templateVersionId, startInputs },
  );
  return response.data.data!;
};

export const getWorkflowRun = async (taskId: number, versionId: number): Promise<WorkflowRun> => {
  const response = await api.get<ApiResponse<WorkflowRun>>(
    `/tasks/${taskId}/versions/${versionId}/workflow/run`,
  );
  return response.data.data!;
};

export const cancelWorkflowRun = async (runId: number): Promise<WorkflowRun> => {
  const response = await api.post<ApiResponse<WorkflowRun>>(`/workflow/runs/${runId}/cancel`);
  return response.data.data!;
};

export const retryWorkflowRun = async (runId: number): Promise<WorkflowRun> => {
  const response = await api.post<ApiResponse<WorkflowRun>>(`/workflow/runs/${runId}/retry`);
  return response.data.data!;
};

export const listNodeRuns = async (runId: number): Promise<NodeRun[]> => {
  const response = await api.get<ApiResponse<NodeRun[]>>(`/workflow/runs/${runId}/nodes`);
  return response.data.data || [];
};

export const createWorkflowRun = async (payload: {
  taskId: number;
  taskVersionId: number;
  templateVersionId: number;
  startInputs?: Record<string, any>;
}): Promise<WorkflowRun> => {
  const response = await api.post<ApiResponse<WorkflowRun>>('/workflow-runs', payload);
  return response.data.data!;
};

export const getWorkflowRunById = async (runId: number): Promise<WorkflowRun> => {
  const response = await api.get<ApiResponse<WorkflowRun>>(`/workflow-runs/${runId}`);
  return response.data.data!;
};

export const submitHumanSelect = async (
  runId: number,
  payload: { nodeRunId?: number; selectedIndices?: number[]; selectedAssetIds?: number[]; metadata?: Record<string, any> },
) => {
  const response = await api.post<ApiResponse<any>>(`/workflow-runs/${runId}/actions/human-select`, payload);
  return response.data.data;
};

export const testNode = async (payload: { nodeType: string; config?: Record<string, any>; inputs?: Record<string, any> }) => {
  const response = await api.post<ApiResponse<any>>('/workflows/node-test', payload);
  return response.data.data;
};

export const testWorkflow = async (payload: {
  nodes: WorkflowTemplateVersion['nodes'];
  edges: WorkflowTemplateVersion['edges'];
  startInputs?: Record<string, any>;
  templateId?: number;
}): Promise<WorkflowTestResult> => {
  const response = await api.post<ApiResponse<WorkflowTestResult>>('/workflows/test', payload, { timeout: 60000 });
  return response.data.data!;
};

export const getReviewAssets = async (nodeRunId: number) => {
  const response = await api.get<ApiResponse<any>>(`/workflow/node-runs/${nodeRunId}/review/assets`);
  return response.data.data || [];
};

export const submitReviewDecision = async (
  nodeRunId: number,
  payload: { approvedAssetIds: number[]; rejectedAssetIds: number[]; reason?: string },
) => {
  const response = await api.post<ApiResponse<any>>(
    `/workflow/node-runs/${nodeRunId}/review/decision`,
    payload,
  );
  return response.data.data;
};

export const uploadReviewAsset = async (
  nodeRunId: number,
  file: File,
  payload?: { replaceAssetId?: number; assetType?: string },
) => {
  const formData = new FormData();
  formData.append('file', file);
  if (payload?.replaceAssetId) formData.append('replaceAssetId', payload.replaceAssetId.toString());
  if (payload?.assetType) formData.append('assetType', payload.assetType);
  const response = await api.post<ApiResponse<any>>(
    `/workflow/node-runs/${nodeRunId}/review/upload`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return response.data.data;
};

export const continueReview = async (nodeRunId: number) => {
  const response = await api.post<ApiResponse<any>>(`/workflow/node-runs/${nodeRunId}/review/continue`);
  return response.data.data;
};
