/**
 * Workflow normalization utilities
 * @module workflow/utils
 */

import { WorkflowNodeType } from '@shared/constants';
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowVariable,
  WorkflowValueType,
} from '@shared/types/workflow.types';

const DEFAULT_VARIABLES: Record<WorkflowNodeType, { inputs: WorkflowVariable[]; outputs: WorkflowVariable[] }> = {
  [WorkflowNodeType.START]: {
    inputs: [{ key: 'input', name: '输入文本', type: 'text', required: true }],
    outputs: [],
  },
  [WorkflowNodeType.END]: {
    inputs: [{ key: 'result', name: '最终输出', type: 'text', required: true }],
    outputs: [{ key: 'result', name: '最终输出', type: 'text', required: true }],
  },
  [WorkflowNodeType.LLM_TOOL]: {
    inputs: [],
    outputs: [],
  },
  [WorkflowNodeType.LLM_PARSE_SCRIPT]: {
    inputs: [{ key: 'script', name: '脚本输入', type: 'text', required: true }],
    outputs: [{ key: 'storyboard', name: '解析结果', type: 'text', required: true }],
  },
  [WorkflowNodeType.GENERATE_STORYBOARD]: {
    inputs: [{ key: 'script', name: '脚本输入', type: 'text', required: true }],
    outputs: [{ key: 'storyboard', name: '分镜脚本', type: 'text', required: true }],
  },
  [WorkflowNodeType.GENERATE_CHARACTER_IMAGES]: {
    inputs: [{ key: 'prompt', name: '角色提示', type: 'text', required: true }],
    outputs: [{ key: 'images', name: '角色图片', type: 'list<asset_ref>', required: true }],
  },
  [WorkflowNodeType.HUMAN_REVIEW_ASSETS]: {
    inputs: [{ key: 'assets', name: '候选资产', type: 'list<asset_ref>', required: true }],
    outputs: [{ key: 'assets', name: '通过资产', type: 'list<asset_ref>', required: true }],
  },
  [WorkflowNodeType.HUMAN_BREAKPOINT]: {
    inputs: [{ key: 'candidates', name: '候选内容', type: 'list<text>', required: true }],
    outputs: [{ key: 'selected', name: '选择结果', type: 'text', required: true }],
  },
  [WorkflowNodeType.GENERATE_SCENE_IMAGE]: {
    inputs: [{ key: 'prompt', name: '场景提示', type: 'text', required: true }],
    outputs: [{ key: 'image', name: '场景图', type: 'asset_ref', required: true }],
  },
  [WorkflowNodeType.GENERATE_KEYFRAMES]: {
    inputs: [{ key: 'prompt', name: '关键帧提示', type: 'text', required: true }],
    outputs: [{ key: 'frames', name: '关键帧', type: 'list<asset_ref>', required: true }],
  },
  [WorkflowNodeType.GENERATE_VIDEO]: {
    inputs: [{ key: 'prompt', name: '视频提示', type: 'text', required: true }],
    outputs: [{ key: 'video', name: '视频', type: 'asset_ref', required: true }],
  },
  [WorkflowNodeType.FINAL_COMPOSE]: {
    inputs: [{ key: 'assets', name: '合成素材', type: 'list<asset_ref>', required: true }],
    outputs: [{ key: 'final', name: '最终视频', type: 'asset_ref', required: true }],
  },
};

export const ensureStartEndNodes = (nodes: WorkflowNode[]): WorkflowNode[] => {
  const hasStart = nodes.some((node) => node.type === WorkflowNodeType.START);
  const hasEnd = nodes.some((node) => node.type === WorkflowNodeType.END);
  if (hasStart && hasEnd) return nodes;

  const occupiedIds = new Set(nodes.map((node) => node.id));
  const startId = occupiedIds.has('node-start') ? 'node-start-auto' : 'node-start';
  const endId = occupiedIds.has('node-end') ? 'node-end-auto' : 'node-end';

  const xs = nodes.map((node) => node.position?.x ?? 0);
  const ys = nodes.map((node) => node.position?.y ?? 0);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 600;
  const baseY = ys.length ? ys[0] : 0;

  const nextNodes = [...nodes];
  if (!hasStart) {
    nextNodes.unshift({
      id: startId,
      type: WorkflowNodeType.START,
      position: { x: minX - 240, y: baseY },
      data: { config: {}, inputs: DEFAULT_VARIABLES[WorkflowNodeType.START].inputs, outputs: DEFAULT_VARIABLES[WorkflowNodeType.START].outputs, nodeType: WorkflowNodeType.START },
    });
  }
  if (!hasEnd) {
    nextNodes.push({
      id: endId,
      type: WorkflowNodeType.END,
      position: { x: maxX + 240, y: baseY },
      data: { config: {}, inputs: DEFAULT_VARIABLES[WorkflowNodeType.END].inputs, outputs: DEFAULT_VARIABLES[WorkflowNodeType.END].outputs, nodeType: WorkflowNodeType.END },
    });
  }
  return nextNodes;
};

export const normalizeNodeVariables = (node: WorkflowNode): WorkflowNode => {
  const nodeType = (node.type || node.data?.nodeType || node.data?.label) as WorkflowNodeType;
  const defaults = DEFAULT_VARIABLES[nodeType];
  let inputs = node.data?.inputs?.length ? node.data.inputs : defaults?.inputs || [];
  let outputs = node.data?.outputs?.length ? node.data.outputs : defaults?.outputs || [];
  if (nodeType === WorkflowNodeType.START) {
    if (!inputs.length && outputs.length) {
      inputs = outputs;
    }
    outputs = [];
  }
  return {
    ...node,
    type: nodeType,
    data: {
      ...node.data,
      nodeType,
      inputs,
      outputs: nodeType === WorkflowNodeType.END && inputs.length && !outputs.length ? inputs : outputs,
    },
  };
};

export const normalizeEdges = (nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowEdge[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    // 兼容前端使用 sourceHandle/targetHandle 作为 key
    const edgeAny = edge as any;
    const sourceKey =
      edge.sourceOutputKey ||
      edgeAny.sourceHandle ||
      source?.data?.outputs?.[0]?.key ||
      (source?.type === WorkflowNodeType.START ? source?.data?.inputs?.[0]?.key : undefined);
    const targetKey = edge.targetInputKey || edgeAny.targetHandle || target?.data?.inputs?.[0]?.key;
    return {
      ...edge,
      sourceOutputKey: sourceKey,
      targetInputKey: targetKey,
    };
  });
};

export const normalizeWorkflowVersion = (
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } => {
  const withStartEnd = ensureStartEndNodes(nodes);
  const normalizedNodes = withStartEnd.map((node) => normalizeNodeVariables(node));
  const normalizedEdges = normalizeEdges(normalizedNodes, edges);
  return { nodes: normalizedNodes, edges: normalizedEdges };
};

export const isListType = (valueType: WorkflowValueType) => valueType.startsWith('list<');

export const getListInnerType = (valueType: WorkflowValueType): WorkflowValueType | null => {
  if (!isListType(valueType)) return null;
  const inner = valueType.replace('list<', '').replace('>', '') as WorkflowValueType;
  return inner;
};

export const isTypeCompatible = (source: WorkflowValueType, target: WorkflowValueType) => {
  if (source === target) return { ok: true as const };
  if (source === 'json' && target === 'text') return { ok: true as const, transform: 'stringify' as const };
  if (source === 'text' && target === 'json') return { ok: true as const, transform: 'parse_json' as const };
  return { ok: false as const };
};
