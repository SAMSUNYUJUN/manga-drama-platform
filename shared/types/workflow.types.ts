/**
 * Workflow related types
 * @module shared/types/workflow
 */

import { NodeRunStatus, WorkflowNodeType, WorkflowRunStatus } from '../constants/enums';

export type WorkflowValueType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'json'
  | 'asset_ref'
  | 'list<text>'
  | 'list<number>'
  | 'list<boolean>'
  | 'list<json>'
  | 'list<asset_ref>';

export type WorkflowValue =
  | string
  | number
  | boolean
  | Record<string, any>
  | Array<any>
  | null;

export interface WorkflowVariable {
  key: string;
  name?: string;
  type: WorkflowValueType;
  required?: boolean;
  defaultValue?: WorkflowValue;
}

export type WorkflowEdgeTransform = 'stringify' | 'parse_json';

export interface WorkflowValidationIssue {
  code:
    | 'missing_start_or_end'
    | 'dangling_edge'
    | 'type_mismatch'
    | 'missing_required_input'
    | 'unreachable_nodes'
    | 'cycles_not_allowed'
    | 'multiple_start_edges';
  message: string;
  nodeId?: string;
  edgeId?: string;
  details?: Record<string, any>;
}

export interface WorkflowValidationResult {
  ok: boolean;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
}

export interface WorkflowTemplate {
  id: number;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowTemplateVersion {
  id: number;
  templateId: number;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label?: string;
  position?: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowNodeData {
  label?: string;
  config: WorkflowNodeConfig;
  inputs?: WorkflowVariable[];
  outputs?: WorkflowVariable[];
  nodeType?: WorkflowNodeType | string;
  toolId?: number;
  toolName?: string;
}

export interface WorkflowNodeConfig {
  promptTemplateVersionId?: number;
  model?: string;
  outputCount?: number;
  requireHuman?: boolean;
  autoApprove?: boolean;
  variables?: Record<string, string>;
  selectionMode?: 'single' | 'multiple';
  multiSelect?: boolean;
  maxDuration?: number;
  resolution?: string;
  fps?: number;
  style?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceOutputKey?: string;
  targetInputKey?: string;
  transform?: WorkflowEdgeTransform;
}

export interface WorkflowRun {
  id: number;
  templateVersionId: number;
  taskId: number;
  taskVersionId: number;
  status: WorkflowRunStatus;
  currentNodeId?: string | null;
  error?: string | null;
  input?: Record<string, any>;
  output?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NodeRun {
  id: number;
  workflowRunId: number;
  nodeId: string;
  nodeType: WorkflowNodeType;
  status: NodeRunStatus;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string | null;
  retryCount: number;
  startedAt?: Date | null;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
