/**
 * Node tool types
 * @module shared/types/node-tool
 */

import type { WorkflowVariable } from './workflow.types';

export interface NodeTool {
  id: number;
  name: string;
  description?: string | null;
  promptTemplateVersionId?: number | null;
  model?: string | null;
  inputs: WorkflowVariable[];
  outputs: WorkflowVariable[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NodeToolTestResult {
  renderedPrompt: string;
  outputText: string;
  parsedJson?: any;
  missingVariables: string[];
  durationMs: number;
  error?: string;
}
