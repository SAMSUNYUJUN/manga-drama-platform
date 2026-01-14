/**
 * Node tool types
 * @module shared/types/node-tool
 */

import type { WorkflowVariable } from './workflow.types';

export const IMAGE_ASPECT_RATIOS = ['2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
export type ImageAspectRatio = typeof IMAGE_ASPECT_RATIOS[number];

export interface NodeTool {
  id: number;
  name: string;
  description?: string | null;
  promptTemplateVersionId?: number | null;
  model?: string | null;
  imageAspectRatio?: string | null;
  inputs: WorkflowVariable[];
  outputs: WorkflowVariable[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NodeToolTestResult {
  renderedPrompt: string;
  outputText: string;
  mediaUrls?: string[];
  parsedJson?: any;
  missingVariables: string[];
  durationMs: number;
  error?: string;
}
