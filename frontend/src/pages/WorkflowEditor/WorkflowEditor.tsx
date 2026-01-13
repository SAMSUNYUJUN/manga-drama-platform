/**
 * Workflow editor page
 * @module pages/WorkflowEditor
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  useUpdateNodeInternals,
  Handle,
  Position,
} from 'reactflow';
import type { Connection, Edge, Node, NodeProps } from 'reactflow';
import 'reactflow/dist/style.css';
import { workflowService, promptService, adminService, nodeToolService, assetService, assetSpaceService } from '../../services';
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowValidationResult,
  WorkflowValueType,
  WorkflowVariable,
  WorkflowTestResult,
} from '@shared/types/workflow.types';
import type { Asset } from '@shared/types/asset.types';
import type { PromptTemplateVersion } from '@shared/types/prompt.types';
import type { ProviderConfig } from '@shared/types/provider.types';
import type { NodeTool } from '@shared/types/node-tool.types';
import { AssetStatus, PAGINATION, ProviderType, WorkflowNodeType } from '@shared/constants';
import styles from './WorkflowEditor.module.scss';

type EditorNodeData = {
  label?: string;
  nodeType?: WorkflowNodeType | string;
  config: Record<string, any>;
  inputs?: WorkflowVariable[];
  outputs?: WorkflowVariable[];
  locked?: boolean;
};

const encodeHandleId = (value?: string) => (value ? encodeURIComponent(value) : value);
const decodeHandleId = (value?: string | null) => {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
const isImageUrl = (value?: string) => {
  if (!value) return false;
  if (value.startsWith('data:image/')) return true;
  return /\.(png|jpg|jpeg|gif|webp)(\?|#|$)/i.test(value);
};
const isVideoUrl = (value?: string) => {
  if (!value) return false;
  if (value.startsWith('data:video/')) return true;
  return /\.(mp4|webm|mov|mkv)(\?|#|$)/i.test(value);
};
const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const VARIABLE_TYPES: WorkflowValueType[] = [
  'text',
  'number',
  'boolean',
  'json',
  'asset_ref',
  'list<text>',
  'list<number>',
  'list<boolean>',
  'list<json>',
  'list<asset_ref>',
];

const FIXED_LIBRARY = [WorkflowNodeType.HUMAN_BREAKPOINT];

const DEFAULT_VARIABLES: Record<WorkflowNodeType, { inputs: WorkflowVariable[]; outputs: WorkflowVariable[] }> = {
  [WorkflowNodeType.START]: {
    inputs: [{ key: 'input', name: '输入文本', type: 'text', required: true }],
    outputs: [],
  },
  [WorkflowNodeType.END]: {
    inputs: [{ key: 'result', name: '最终输出', type: 'text', required: true }],
    outputs: [{ key: 'result', name: '最终输出', type: 'text', required: true }],
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

const NODE_PROVIDER_TYPE_MAP: Partial<Record<WorkflowNodeType, ProviderType>> = {
  [WorkflowNodeType.LLM_TOOL]: ProviderType.LLM,
  [WorkflowNodeType.LLM_PARSE_SCRIPT]: ProviderType.LLM,
  [WorkflowNodeType.GENERATE_STORYBOARD]: ProviderType.LLM,
  [WorkflowNodeType.GENERATE_CHARACTER_IMAGES]: ProviderType.IMAGE,
  [WorkflowNodeType.GENERATE_SCENE_IMAGE]: ProviderType.IMAGE,
  [WorkflowNodeType.GENERATE_KEYFRAMES]: ProviderType.IMAGE,
  [WorkflowNodeType.GENERATE_VIDEO]: ProviderType.VIDEO,
};

const ensureStartEndNodes = (nodes: Node<EditorNodeData>[]) => {
  const hasStart = nodes.some((node) => node.data?.nodeType === WorkflowNodeType.START || node.type === WorkflowNodeType.START);
  const hasEnd = nodes.some((node) => node.data?.nodeType === WorkflowNodeType.END || node.type === WorkflowNodeType.END);
  if (hasStart && hasEnd) return nodes;
  const ids = new Set(nodes.map((node) => node.id));
  const startId = ids.has('node-start') ? 'node-start-auto' : 'node-start';
  const endId = ids.has('node-end') ? 'node-end-auto' : 'node-end';
  const xs = nodes.map((node) => node.position?.x ?? 0);
  const ys = nodes.map((node) => node.position?.y ?? 0);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 600;
  const baseY = ys.length ? ys[0] : 0;

  const next = [...nodes];
  if (!hasStart) {
    next.unshift({
      id: startId,
      type: WorkflowNodeType.START,
      position: { x: minX - 240, y: baseY },
      data: {
        label: 'Start',
        nodeType: WorkflowNodeType.START,
        config: {},
        inputs: DEFAULT_VARIABLES[WorkflowNodeType.START].inputs,
        outputs: DEFAULT_VARIABLES[WorkflowNodeType.START].outputs,
        locked: true,
      },
      deletable: false,
    });
  }
  if (!hasEnd) {
    next.push({
      id: endId,
      type: WorkflowNodeType.END,
      position: { x: maxX + 240, y: baseY },
      data: {
        label: 'End',
        nodeType: WorkflowNodeType.END,
        config: {},
        inputs: DEFAULT_VARIABLES[WorkflowNodeType.END].inputs,
        outputs: DEFAULT_VARIABLES[WorkflowNodeType.END].outputs,
        locked: true,
      },
      deletable: false,
    });
  }
  return next;
};

const normalizeNodes = (nodes: Node<EditorNodeData>[]) =>
  ensureStartEndNodes(nodes).map((node) => {
    const nodeType = (node.data?.nodeType || node.type || (node.data as any)?.label) as WorkflowNodeType;
    const defaults = DEFAULT_VARIABLES[nodeType];
    const data = node.data || { config: {} };
    let inputs = data.inputs?.length ? data.inputs : defaults?.inputs || [];
    let outputs = data.outputs?.length ? data.outputs : defaults?.outputs || [];
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
        ...data,
        nodeType,
        inputs,
        outputs: nodeType === WorkflowNodeType.END && inputs.length ? inputs : outputs,
        locked: data.locked || nodeType === WorkflowNodeType.START || nodeType === WorkflowNodeType.END,
      },
      deletable: data.locked || nodeType === WorkflowNodeType.START || nodeType === WorkflowNodeType.END ? false : true,
    };
  });

const normalizeEdges = (nodes: Node<EditorNodeData>[], edges: Edge[]) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    const sourceKey =
      (edge as any).sourceOutputKey ||
      decodeHandleId(edge.sourceHandle) ||
      source?.data?.outputs?.[0]?.key ||
      ((source?.data?.nodeType || source?.type) === WorkflowNodeType.START
        ? source?.data?.inputs?.[0]?.key
        : undefined);
    const targetKey =
      (edge as any).targetInputKey || decodeHandleId(edge.targetHandle) || target?.data?.inputs?.[0]?.key;
    return {
      ...edge,
      sourceHandle: sourceKey ? encodeHandleId(sourceKey) : undefined,
      targetHandle: targetKey ? encodeHandleId(targetKey) : undefined,
      sourceOutputKey: sourceKey,
      targetInputKey: targetKey,
    } as Edge;
  });
};

const getTypeCompatibility = (source?: WorkflowValueType, target?: WorkflowValueType) => {
  if (!source || !target) return { ok: false as const };
  if (source === target) return { ok: true as const };
  if (source === 'json' && target === 'text') return { ok: true as const, transform: 'stringify' as const };
  if (source === 'text' && target === 'json') return { ok: true as const, transform: 'parse_json' as const };
  return { ok: false as const };
};

const VariableNode = ({ id, data }: NodeProps<EditorNodeData>) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const inputs = data.inputs || [];
  const outputs = data.outputs || [];
  const isStart = data.nodeType === WorkflowNodeType.START;
  const isEnd = data.nodeType === WorkflowNodeType.END;
  const displayInputs = isStart ? [] : inputs;
  const displayOutputs = isStart ? inputs : outputs;
  const handleSignature = useMemo(
    () =>
      [
        isStart ? 'start' : 'node',
        isEnd ? 'end' : 'mid',
        inputs.map((item) => item.key).join('|'),
        outputs.map((item) => item.key).join('|'),
      ].join('::'),
    [inputs, outputs, isStart, isEnd],
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, handleSignature]);
  return (
    <div className={styles.nodeCard}>
      <div className={styles.nodeTitle}>{data.label || data.nodeType}</div>
      <div className={styles.nodeBody}>
        <div className={styles.nodeColumn}>
          {displayInputs.map((input) => (
            <div key={input.key} className={styles.nodeRow}>
              <Handle
                type="target"
                position={Position.Left}
                id={encodeHandleId(input.key)}
                isConnectable={!isStart}
              />
              <span className={styles.nodeLabel}>{input.key}</span>
              <span className={styles.nodeType}>{input.type}</span>
            </div>
          ))}
        </div>
        <div className={styles.nodeColumn}>
          {displayOutputs.map((output) => (
            <div key={output.key} className={styles.nodeRow}>
              <span className={styles.nodeLabel}>{output.key}</span>
              <span className={styles.nodeType}>{output.type}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={encodeHandleId(output.key)}
                isConnectable={!isEnd}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const NODE_TYPES = {
  default: VariableNode,
  [WorkflowNodeType.START]: VariableNode,
  [WorkflowNodeType.END]: VariableNode,
  [WorkflowNodeType.LLM_TOOL]: VariableNode,
  [WorkflowNodeType.LLM_PARSE_SCRIPT]: VariableNode,
  [WorkflowNodeType.GENERATE_STORYBOARD]: VariableNode,
  [WorkflowNodeType.GENERATE_CHARACTER_IMAGES]: VariableNode,
  [WorkflowNodeType.HUMAN_REVIEW_ASSETS]: VariableNode,
  [WorkflowNodeType.HUMAN_BREAKPOINT]: VariableNode,
  [WorkflowNodeType.GENERATE_SCENE_IMAGE]: VariableNode,
  [WorkflowNodeType.GENERATE_KEYFRAMES]: VariableNode,
  [WorkflowNodeType.GENERATE_VIDEO]: VariableNode,
  [WorkflowNodeType.FINAL_COMPOSE]: VariableNode,
};
const EDGE_TYPES = {};

export const WorkflowEditor = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<EditorNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [promptVersions, setPromptVersions] = useState<PromptTemplateVersion[]>([]);
  const [nodeTools, setNodeTools] = useState<NodeTool[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [modelLoadError, setModelLoadError] = useState('');
  const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [nodeTestInputs, setNodeTestInputs] = useState<Record<string, Record<string, any>>>({});
  const [nodeTestResults, setNodeTestResults] = useState<Record<string, any>>({});
  const [workflowTestInputs, setWorkflowTestInputs] = useState<Record<string, any>>({});
  const [workflowTestResult, setWorkflowTestResult] = useState<WorkflowTestResult | null>(null);
  const [workflowTestError, setWorkflowTestError] = useState('');
  const [workflowTestRunning, setWorkflowTestRunning] = useState(false);
  const [workflowTestAssets, setWorkflowTestAssets] = useState<Asset[]>([]);
  const [workflowTestAssetSpaceId, setWorkflowTestAssetSpaceId] = useState<number | null>(null);
  const [workflowTestAssetLoading, setWorkflowTestAssetLoading] = useState(false);
  const [workflowTestAssetError, setWorkflowTestAssetError] = useState('');
  const nodeTypes = useMemo(() => NODE_TYPES, []);
  const edgeTypes = useMemo(() => EDGE_TYPES, []);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId],
  );
  const selectedNodeType = selectedNode
    ? ((selectedNode.data?.nodeType || selectedNode.type) as WorkflowNodeType)
    : undefined;
  const isToolNode = selectedNodeType === WorkflowNodeType.LLM_TOOL;
  const isStartOrEnd = selectedNodeType === WorkflowNodeType.START || selectedNodeType === WorkflowNodeType.END;
  const showInputMapping = selectedNodeType !== WorkflowNodeType.START;
  const startNode = useMemo(
    () => nodes.find((node) => (node.data?.nodeType || node.type) === WorkflowNodeType.START) || null,
    [nodes],
  );
  const startNodeInputs = useMemo(
    () => ((startNode?.data?.inputs || []) as WorkflowVariable[]),
    [startNode],
  );
  const outputOptions = useMemo(() => {
    if (!selectedNode) return [];
    const items: Array<{
      value: string;
      label: string;
      nodeId: string;
      outputKey: string;
      type: WorkflowValueType;
    }> = [];
    nodes.forEach((node) => {
      if (node.id === selectedNode.id) return;
      const nodeType = (node.data?.nodeType || node.type) as WorkflowNodeType;
      const outputs = nodeType === WorkflowNodeType.START ? node.data?.inputs || [] : node.data?.outputs || [];
      const label = node.data?.label || node.data?.nodeType || node.type || node.id;
      outputs.forEach((output) => {
        items.push({
          value: `${node.id}::${output.key}`,
          label: `${label} · ${output.key} (${output.type})`,
          nodeId: node.id,
          outputKey: output.key,
          type: output.type,
        });
      });
    });
    return items;
  }, [nodes, selectedNode]);

  const workflowTestMediaUrls = useMemo(() => {
    const urls: string[] = [];
    const pushUrl = (value: any) => {
      if (typeof value === 'string' && /^(https?:\/\/|data:image\/|data:video\/)/i.test(value)) {
        urls.push(value);
      }
    };
    const collect = (value: any) => {
      if (typeof value === 'string') {
        pushUrl(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => collect(item));
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach((item) => collect(item));
      }
    };
    if (workflowTestResult?.finalOutput) {
      collect(workflowTestResult.finalOutput);
    }
    return Array.from(new Set(urls));
  }, [workflowTestResult]);

  const workflowTestAssetMap = useMemo(
    () => new Map(workflowTestAssets.map((asset) => [asset.id, asset])),
    [workflowTestAssets],
  );
  const workflowTestSelectableAssets = useMemo(
    () =>
      workflowTestAssets.filter((asset) => {
        if (asset.mimeType?.startsWith('image/') || asset.mimeType?.startsWith('video/')) return true;
        return isImageUrl(asset.url) || isVideoUrl(asset.url);
      }),
    [workflowTestAssets],
  );
  const hasAssetTestInputs = useMemo(
    () => startNodeInputs.some((input) => input.type === 'asset_ref' || input.type === 'list<asset_ref>'),
    [startNodeInputs],
  );

  const modelOptions = useMemo(() => {
    if (!selectedNode) return [];
    const nodeType = (selectedNode.data?.nodeType || selectedNode.type) as WorkflowNodeType | undefined;
    const providerType = nodeType ? NODE_PROVIDER_TYPE_MAP[nodeType] : undefined;
    if (!providerType) return [];
    const options = providers
      .filter((provider) => provider.type === providerType && provider.enabled)
      .flatMap((provider) => provider.models || []);
    return Array.from(new Set(options));
  }, [providers, selectedNode]);

  const showConnectionError = (message: string) => {
    setConnectionError(message);
    setTimeout(() => setConnectionError(''), 2000);
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      if (!sourceNode || !targetNode) return;
      if ((sourceNode.data?.nodeType || sourceNode.type) === WorkflowNodeType.END) {
        showConnectionError('End 节点不能作为输出端');
        return;
      }
      if ((targetNode.data?.nodeType || targetNode.type) === WorkflowNodeType.START) {
        showConnectionError('Start 节点不能作为输入端');
        return;
      }

      const sourceOutputs = sourceNode.data?.outputs || [];
      const sourceInputs = sourceNode.data?.inputs || [];
      const targetInputs = targetNode.data?.inputs || [];
      const isStartSource = (sourceNode.data?.nodeType || sourceNode.type) === WorkflowNodeType.START;
      const sourceVars = isStartSource ? sourceInputs : sourceOutputs;
      const sourceKey = decodeHandleId(connection.sourceHandle) || sourceVars[0]?.key;
      if (!sourceKey) {
        showConnectionError('源节点没有可用变量');
        return;
      }
      const sourceVar = sourceVars.find((item) => item.key === sourceKey);
      if (!sourceVar) {
        showConnectionError('未找到源变量');
        return;
      }

      let targetKey = decodeHandleId(connection.targetHandle) || targetInputs[0]?.key;
      let targetVar = targetInputs.find((item) => item.key === targetKey);
      if (!targetVar) {
        const autoKey = targetKey || `input_${targetInputs.length + 1}`;
        const autoVar: WorkflowVariable = {
          key: autoKey,
          name: autoKey,
          type: sourceVar.type,
          required: true,
        };
        setNodes((nds) =>
          nds.map((node) =>
            node.id === targetNode.id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    inputs: [...(node.data.inputs || []), autoVar],
                  },
                }
              : node,
          ),
        );
        targetKey = autoKey;
        targetVar = autoVar;
      }

      const compatibility = getTypeCompatibility(sourceVar.type, targetVar.type);
      if (!compatibility.ok) {
        showConnectionError(`类型不匹配: ${sourceVar.type} -> ${targetVar.type}`);
        return;
      }

      const newEdge: Edge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: encodeHandleId(sourceKey),
        targetHandle: encodeHandleId(targetKey),
        sourceOutputKey: sourceKey,
        targetInputKey: targetKey,
        transform: compatibility.transform,
      } as Edge;
      setEdges((eds) => eds.concat(newEdge));
    },
    [nodes, setEdges, setNodes],
  );

  const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const payload = event.dataTransfer.getData('application/reactflow');
      if (!payload) return;
      const position = { x: event.clientX - 280, y: event.clientY - 140 };
      if (payload.startsWith('tool:')) {
        const toolId = Number(payload.replace('tool:', ''));
        const tool = nodeTools.find((item) => item.id === toolId);
        if (!tool) return;
        const newNode: Node<EditorNodeData> = {
          id: `tool-${tool.id}-${Date.now()}`,
          type: WorkflowNodeType.LLM_TOOL,
          position,
          data: {
            label: tool.name,
            nodeType: WorkflowNodeType.LLM_TOOL,
            toolId: tool.id,
            toolName: tool.name,
            config: {
              promptTemplateVersionId: tool.promptTemplateVersionId,
              model: tool.model || undefined,
            },
            inputs: tool.inputs,
            outputs: tool.outputs,
          },
        };
        setNodes((nds) => normalizeNodes(nds.concat(newNode)));
        return;
      }

      const type = payload as WorkflowNodeType;
      const defaults = DEFAULT_VARIABLES[type];
      const newNode: Node<EditorNodeData> = {
        id: `${type}-${Date.now()}`,
        type: type,
        position,
        data: {
          label: type,
          nodeType: type,
          config: {
            outputCount: 1,
            requireHuman: false,
          },
          inputs: defaults?.inputs || [],
          outputs: defaults?.outputs || [],
        },
      };
      setNodes((nds) => normalizeNodes(nds.concat(newNode)));
    },
    [nodeTools, setNodes],
  );

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleSelectNode = useCallback((_event: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handleNodesChange = useCallback(
    (changes: any[]) => {
      const filtered = changes.filter((change) => {
        if (change.type !== 'remove') return true;
        const target = nodes.find((node) => node.id === change.id);
        return !target?.data?.locked;
      });
      onNodesChange(filtered);
    },
    [nodes, onNodesChange],
  );

  const handleConfigChange = (field: string, value: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                config: {
                  ...node.data.config,
                  [field]: value,
                },
              },
            }
          : node,
      ),
    );
  };

  const handleVariableChange = (
    group: 'inputs' | 'outputs',
    index: number,
    field: keyof WorkflowVariable,
    value: any,
  ) => {
    if (!selectedNode) return;
    const isStartNode = (selectedNode.data?.nodeType || selectedNode.type) === WorkflowNodeType.START;
    const previousKey = selectedNode.data[group]?.[index]?.key;
    const previousName = selectedNode.data[group]?.[index]?.name;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== selectedNode.id) return node;
        const list = [...(node.data[group] || [])];
        const updated = { ...list[index], [field]: value };
        if (field === 'key' && (previousName === undefined || previousName === '' || previousName === previousKey)) {
          updated.name = value;
        }
        list[index] = updated;
        return { ...node, data: { ...node.data, [group]: list } };
      }),
    );
    if (field === 'key' && previousKey && previousKey !== value) {
      setEdges((eds) =>
        eds.map((edge) => {
          if (group === 'inputs' && edge.target === selectedNode.id && (edge as any).targetInputKey === previousKey) {
            return {
              ...edge,
              targetHandle: encodeHandleId(value),
              targetInputKey: value,
            } as Edge;
          }
          const isSourceMatch = edge.source === selectedNode.id && (edge as any).sourceOutputKey === previousKey;
          if ((group === 'outputs' && isSourceMatch) || (group === 'inputs' && isStartNode && isSourceMatch)) {
            return {
              ...edge,
              sourceHandle: encodeHandleId(value),
              sourceOutputKey: value,
            } as Edge;
          }
          return edge;
        }),
      );
    }
  };

  const handleAddVariable = (group: 'inputs' | 'outputs') => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== selectedNode.id) return node;
        const list = [...(node.data[group] || [])];
        const key = `${group}_${list.length + 1}`;
        list.push({ key, name: key, type: 'text', required: false });
        return { ...node, data: { ...node.data, [group]: list } };
      }),
    );
  };

  const handleRemoveVariable = (group: 'inputs' | 'outputs', index: number) => {
    if (!selectedNode) return;
    const isStartNode = (selectedNode.data?.nodeType || selectedNode.type) === WorkflowNodeType.START;
    const variable = selectedNode.data[group]?.[index];
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== selectedNode.id) return node;
        const list = [...(node.data[group] || [])];
        list.splice(index, 1);
        return { ...node, data: { ...node.data, [group]: list } };
      }),
    );
    if (variable) {
      setEdges((eds) =>
        eds.filter((edge) => {
          if (group === 'inputs') {
            const targetMatch = edge.target === selectedNode.id && (edge as any).targetInputKey === variable.key;
            const startSourceMatch = isStartNode && edge.source === selectedNode.id && (edge as any).sourceOutputKey === variable.key;
            return !targetMatch && !startSourceMatch;
          }
          return (edge as any).sourceOutputKey !== variable.key;
        }),
      );
    }
  };

  const buildVariablesFromVersion = (
    versionId: number,
    current: Record<string, string> | undefined,
  ) => {
    const version = promptVersions.find((item) => item.id === versionId);
    if (!version) return current || {};
    const next: Record<string, string> = {};
    (version.variables || []).forEach((key) => {
      next[key] = current?.[key] ?? '';
    });
    return next;
  };

  const handleSaveVersion = async () => {
    if (!id) return;
    const normalizedNodes = normalizeNodes(nodes).map((node) => ({
      ...node,
      type: node.data?.nodeType || node.type,
      data: {
        ...node.data,
        nodeType: node.data?.nodeType || node.type,
      },
    }));
    const normalizedEdges = normalizeEdges(normalizedNodes, edges);
    const validation = await workflowService.validateWorkflow({
      nodes: normalizedNodes as unknown as WorkflowNode[],
      edges: normalizedEdges as unknown as WorkflowEdge[],
      metadata: {},
    });
    setValidationResult(validation);
    if (!validation.ok) return;
    await workflowService.createWorkflowTemplateVersion(Number(id), {
      nodes: normalizedNodes as unknown as WorkflowNode[],
      edges: normalizedEdges as unknown as WorkflowEdge[],
      metadata: {},
    });
    alert('已保存新版本');
  };

  const handleValidate = async () => {
    const normalizedNodes = normalizeNodes(nodes);
    const normalizedEdges = normalizeEdges(normalizedNodes, edges);
    const validation = await workflowService.validateWorkflow({
      nodes: normalizedNodes as unknown as WorkflowNode[],
      edges: normalizedEdges as unknown as WorkflowEdge[],
      metadata: {},
    });
    setValidationResult(validation);
  };

  const loadVersion = async () => {
    if (!id) return;
    const versionId = searchParams.get('versionId');
    try {
      if (versionId) {
        const data = await workflowService.getWorkflowTemplateVersion(Number(id), Number(versionId));
        const normalizedNodes = normalizeNodes((data.nodes || []) as Node<EditorNodeData>[]);
        const normalizedEdges = normalizeEdges(normalizedNodes, (data.edges || []) as Edge[]);
        setNodes(normalizedNodes as Node<EditorNodeData>[]);
        setEdges(normalizedEdges as Edge[]);
      } else {
        setNodes(normalizeNodes([]));
        setEdges([]);
      }
      setLoadError('');
    } catch (error: any) {
      setLoadError(error?.message || '加载工作流版本失败');
    }
  };

  const loadPromptVersions = async () => {
    try {
      const prompts = await promptService.listPrompts();
      const versions: PromptTemplateVersion[] = [];
      for (const prompt of prompts) {
        const list = await promptService.listPromptVersions(prompt.id);
        list.forEach((version) => versions.push(version));
      }
      setPromptVersions(versions);
      setLoadError('');
    } catch (error: any) {
      setPromptVersions([]);
      setLoadError(error?.message || '加载 Prompt 模板失败');
    }
  };

  const loadProviders = async () => {
    try {
      const list = await adminService.listProviders();
      setProviders(list);
      setModelLoadError('');
    } catch (error: any) {
      setProviders([]);
      setModelLoadError(error?.message || '无法加载模型列表');
    }
  };

  const loadNodeTools = async () => {
    try {
      const list = await nodeToolService.listNodeTools(true);
      setNodeTools(list);
      setLoadError('');
    } catch (error: any) {
      setNodeTools([]);
      setLoadError(error?.message || '加载节点工具失败');
    }
  };

  const runNodeTest = async () => {
    if (!selectedNode) return;
    const rawInputs = nodeTestInputs[selectedNode.id] || {};
    const inputs: Record<string, any> = {};
    (selectedNode.data.inputs || []).forEach((input) => {
      const raw = rawInputs[input.key];
      if (input.type === 'number') {
        inputs[input.key] = raw === '' || raw === undefined ? undefined : Number(raw);
        return;
      }
      if (input.type === 'boolean') {
        inputs[input.key] = raw === true || raw === 'true';
        return;
      }
      if (input.type === 'json' || input.type.startsWith('list<')) {
        try {
          inputs[input.key] = raw ? JSON.parse(raw) : raw;
          return;
        } catch {
          inputs[input.key] = raw;
          return;
        }
      }
      inputs[input.key] = raw;
    });
    const payload = {
      nodeType: selectedNode.data?.nodeType || selectedNode.type,
      config: selectedNode.data?.config || {},
      inputs,
    };
    const result = await workflowService.testNode(payload);
    setNodeTestResults((prev) => ({ ...prev, [selectedNode.id]: result }));
  };

  const updateNodeTestInput = (key: string, value: any) => {
    if (!selectedNode) return;
    setNodeTestInputs((prev) => ({
      ...prev,
      [selectedNode.id]: {
        ...(prev[selectedNode.id] || {}),
        [key]: value,
      },
    }));
  };

  const handleInputMappingChange = (input: WorkflowVariable, value: string) => {
    if (!selectedNode) return;
    if (!value) {
      setEdges((eds) =>
        eds.filter(
          (edge) => !(edge.target === selectedNode.id && (edge as any).targetInputKey === input.key),
        ),
      );
      return;
    }
    const [sourceId, outputKey] = value.split('::');
    const sourceNode = nodes.find((node) => node.id === sourceId);
    if (!sourceNode) return;
    const sourceNodeType = (sourceNode.data?.nodeType || sourceNode.type) as WorkflowNodeType;
    const sourceVars =
      sourceNodeType === WorkflowNodeType.START ? sourceNode.data?.inputs || [] : sourceNode.data?.outputs || [];
    const sourceVar = sourceVars.find((item) => item.key === outputKey);
    if (!sourceVar) return;
    const compatibility = getTypeCompatibility(sourceVar.type, input.type);
    if (!compatibility.ok) {
      showConnectionError(`类型不匹配: ${sourceVar.type} -> ${input.type}`);
      return;
    }
    setEdges((eds) => {
      let updated = false;
      const next = eds.map((edge) => {
        if (edge.target === selectedNode.id && (edge as any).targetInputKey === input.key) {
          updated = true;
          return {
            ...edge,
            source: sourceId,
            sourceHandle: encodeHandleId(outputKey),
            sourceOutputKey: outputKey,
            targetHandle: encodeHandleId(input.key),
            targetInputKey: input.key,
            transform: compatibility.transform,
          } as Edge;
        }
        return edge;
      });
      if (!updated) {
        next.push({
          id: `e-${sourceId}-${selectedNode.id}-${input.key}-${Date.now()}`,
          source: sourceId,
          target: selectedNode.id,
          sourceHandle: encodeHandleId(outputKey),
          targetHandle: encodeHandleId(input.key),
          sourceOutputKey: outputKey,
          targetInputKey: input.key,
          transform: compatibility.transform,
        } as Edge);
      }
      return next;
    });
  };

  const updateWorkflowTestInput = (key: string, value: any) => {
    setWorkflowTestInputs((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resolveTestInputAssetIds = (value: any) => {
    if (typeof value === 'number') return [value];
    if (Array.isArray(value)) {
      const ids: number[] = [];
      value.forEach((item) => {
        if (typeof item === 'number') {
          ids.push(item);
          return;
        }
        if (typeof item === 'string') {
          const parsed = Number(item);
          if (Number.isFinite(parsed)) ids.push(parsed);
        }
      });
      return ids;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? [parsed] : [];
    }
    return [];
  };

  const resolveTestInputMediaUrls = (value: any) => {
    const urls: string[] = [];
    const pushValue = (item: any) => {
      if (typeof item === 'number') {
        const asset = workflowTestAssetMap.get(item);
        if (asset && (isImageUrl(asset.url) || isVideoUrl(asset.url))) {
          urls.push(asset.url);
        }
        return;
      }
      if (typeof item === 'string') {
        if (isImageUrl(item) || isVideoUrl(item)) urls.push(item);
        return;
      }
      if (item && typeof item === 'object') {
        const url = item.url || item.image_url?.url;
        if (typeof url === 'string' && (isImageUrl(url) || isVideoUrl(url))) {
          urls.push(url);
        }
      }
    };
    if (Array.isArray(value)) {
      value.forEach((item) => pushValue(item));
      return urls;
    }
    pushValue(value);
    return urls;
  };

  const handleWorkflowTestAssetUpload = async (
    inputKey: string,
    files: FileList | null,
    isList: boolean,
  ) => {
    const fileList = files ? Array.from(files) : [];
    if (!fileList.length) {
      updateWorkflowTestInput(inputKey, isList ? [] : '');
      return;
    }
    if (workflowTestAssetSpaceId) {
      try {
        setWorkflowTestAssetError('');
        const uploads = await assetSpaceService.uploadAssetsToSpace(workflowTestAssetSpaceId, fileList);
        if (uploads.length) {
          setWorkflowTestAssets((prev) => {
            const seen = new Set<number>();
            const next = [...uploads, ...prev].filter((asset) => {
              if (seen.has(asset.id)) return false;
              seen.add(asset.id);
              return true;
            });
            return next;
          });
        }
        const ids = uploads.map((asset) => asset.id);
        updateWorkflowTestInput(inputKey, isList ? ids : ids[0] ?? '');
      } catch (error: any) {
        setWorkflowTestAssetError(error?.message || '上传资产失败');
        updateWorkflowTestInput(inputKey, isList ? [] : '');
      }
      return;
    }
    try {
      const dataUris = await Promise.all(fileList.map((file) => readFileAsDataUrl(file)));
      updateWorkflowTestInput(inputKey, isList ? dataUris : dataUris[0]);
    } catch {
      updateWorkflowTestInput(inputKey, isList ? [] : '');
    }
  };

  const handleWorkflowTestAssetSelect = (
    inputKey: string,
    value: string,
    selectedOptions: HTMLOptionsCollection,
    isList: boolean,
  ) => {
    if (isList) {
      const ids = Array.from(selectedOptions)
        .map((option) => Number(option.value))
        .filter((id) => Number.isFinite(id));
      updateWorkflowTestInput(inputKey, ids);
      return;
    }
    const id = value ? Number(value) : NaN;
    updateWorkflowTestInput(inputKey, Number.isFinite(id) ? id : '');
  };

  useEffect(() => {
    loadVersion();
    loadPromptVersions();
    loadProviders();
    loadNodeTools();
  }, [id, searchParams.toString()]);

  useEffect(() => {
    const loadWorkflowTestAssets = async () => {
      if (!id) return;
      setWorkflowTestAssetLoading(true);
      setWorkflowTestAssetError('');
      try {
        const template = await workflowService.getWorkflowTemplate(Number(id));
        const spaceId = template.spaceId ?? null;
        setWorkflowTestAssetSpaceId(spaceId);
        if (!spaceId) {
          setWorkflowTestAssets([]);
          return;
        }
        const data = await assetService.listAssets({
          spaceId,
          status: AssetStatus.ACTIVE,
          page: 1,
          limit: PAGINATION.MAX_LIMIT,
        });
        setWorkflowTestAssets(data.items || []);
      } catch (error: any) {
        setWorkflowTestAssets([]);
        setWorkflowTestAssetSpaceId(null);
        setWorkflowTestAssetError(error?.message || '加载资产失败');
      } finally {
        setWorkflowTestAssetLoading(false);
      }
    };
    loadWorkflowTestAssets();
  }, [id]);

  useEffect(() => {
    if (!selectedNode) return;
    const versionId = selectedNode.data.config?.promptTemplateVersionId;
    if (!versionId) return;
    const version = promptVersions.find((item) => item.id === versionId);
    if (!version || !version.variables?.length) return;
    const current = selectedNode.data.config?.variables || {};
    const missing = version.variables.some((key) => !(key in current));
    if (!missing) return;
    handleConfigChange('variables', buildVariablesFromVersion(versionId, current));
  }, [selectedNodeId, selectedNode?.data?.config?.promptTemplateVersionId, promptVersions]);

  useEffect(() => {
    setWorkflowTestInputs((prev) => {
      const next = { ...prev };
      startNodeInputs.forEach((input) => {
        if (!(input.key in next)) {
          const value = input.defaultValue;
          const isAssetInput = input.type === 'asset_ref' || input.type === 'list<asset_ref>';
          if (isAssetInput) {
            if (value !== undefined) {
              next[input.key] = value;
            } else {
              next[input.key] = input.type === 'list<asset_ref>' ? [] : '';
            }
            return;
          }
          if (value && typeof value === 'object') {
            next[input.key] = JSON.stringify(value, null, 2);
            return;
          }
          next[input.key] = value ?? '';
        }
      });
      Object.keys(next).forEach((key) => {
        if (!startNodeInputs.some((input) => input.key === key)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [startNodeInputs]);

  const runWorkflowTest = async () => {
    if (!startNode) {
      setWorkflowTestError('未找到 Start 节点');
      return;
    }
    const normalizedNodes = normalizeNodes(nodes).map((node) => ({
      ...node,
      type: node.data?.nodeType || node.type,
      data: {
        ...node.data,
        nodeType: node.data?.nodeType || node.type,
      },
    }));
    const normalizedEdges = normalizeEdges(normalizedNodes, edges);
    const inputs: Record<string, any> = {};
    startNodeInputs.forEach((input) => {
      const raw = workflowTestInputs[input.key];
      if (input.type === 'number') {
        inputs[input.key] = raw === '' || raw === undefined ? undefined : Number(raw);
        return;
      }
      if (input.type === 'boolean') {
        inputs[input.key] = raw === true || raw === 'true';
        return;
      }
      if (input.type === 'json' || input.type.startsWith('list<')) {
        try {
          inputs[input.key] = raw ? JSON.parse(raw) : raw;
          return;
        } catch {
          inputs[input.key] = raw;
          return;
        }
      }
      inputs[input.key] = raw;
    });
    setWorkflowTestRunning(true);
    setWorkflowTestError('');
    try {
      const result = await workflowService.testWorkflow({
        nodes: normalizedNodes as unknown as WorkflowNode[],
        edges: normalizedEdges as unknown as WorkflowEdge[],
        startInputs: inputs,
        templateId: id ? Number(id) : undefined,
      });
      setWorkflowTestResult(result);
    } catch (error: any) {
      setWorkflowTestResult(null);
      setWorkflowTestError(error?.message || '工作流测试失败');
    } finally {
      setWorkflowTestRunning(false);
    }
  };

  return (
    <div className={styles.editor}>
      <aside className={styles.sidebar}>
        <div className={styles.panel}>
          <h3>节点库</h3>
          <div className={styles.nodeList}>
            {nodeTools.map((tool) => (
              <div
                key={`tool-${tool.id}`}
                className={styles.nodeItem}
                draggable
                onDragStart={(event) => onDragStart(event, `tool:${tool.id}`)}
              >
                {tool.name}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.panel}>
          <h3>固定工具</h3>
          <div className={styles.nodeList}>
            {FIXED_LIBRARY.map((nodeType) => (
              <div
                key={nodeType}
                className={styles.nodeItem}
                draggable
                onDragStart={(event) => onDragStart(event, nodeType)}
              >
                {nodeType}
              </div>
            ))}
          </div>
        </div>
        <button className="btn btn--secondary" onClick={handleValidate}>
          校验工作流
        </button>
        <button className="btn btn--primary" onClick={handleSaveVersion}>
          保存为新版本
        </button>
        {validationResult && (
          <div className={styles.validation}>
            <h4>校验结果</h4>
            {!validationResult.ok && (
              <div className={styles.validationList}>
                {validationResult.errors.map((item, index) => (
                  <div key={`${item.code}-${index}`} className={styles.validationError}>
                    {item.message}
                  </div>
                ))}
              </div>
            )}
            {!!validationResult.warnings.length && (
              <div className={styles.validationList}>
                {validationResult.warnings.map((item, index) => (
                  <div key={`${item.code}-${index}`} className={styles.validationWarning}>
                    {item.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>

      <div className={styles.canvas} onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleSelectNode}
          fitView
        >
          <Background color="#2a2a2a" />
          <MiniMap />
          <Controls />
        </ReactFlow>
        {connectionError && <div className={styles.toast}>{connectionError}</div>}
      </div>

      <aside className={styles.config}>
        <h3>节点配置</h3>
        {loadError && <div className={styles.validationError}>{loadError}</div>}
        {selectedNode ? (
          <div className={styles.configForm}>
            <label>节点名称</label>
            <input
              value={selectedNode.data.label || ''}
              onChange={(event) =>
                setNodes((nds) =>
                  nds.map((node) =>
                    node.id === selectedNode.id
                      ? { ...node, data: { ...node.data, label: event.target.value } }
                      : node,
                  ),
                )
              }
            />

            {!isStartOrEnd && !isToolNode && (
              <>
                <label>Prompt 模板版本</label>
                <select
                  value={selectedNode.data.config?.promptTemplateVersionId || ''}
                  onChange={(event) => {
                    const versionId = event.target.value ? Number(event.target.value) : undefined;
                    handleConfigChange('promptTemplateVersionId', versionId);
                    if (versionId) {
                      handleConfigChange(
                        'variables',
                        buildVariablesFromVersion(
                          versionId,
                          selectedNode.data.config?.variables || {},
                        ),
                      );
                    }
                  }}
                >
                  <option value="">-- 选择版本 --</option>
                  {promptVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.name || '未命名版本'}
                    </option>
                  ))}
                </select>

                <label>Prompt 文本</label>
                <textarea
                  rows={4}
                  value={selectedNode.data.config?.prompt || ''}
                  onChange={(event) => handleConfigChange('prompt', event.target.value)}
                />

                <label>变量(JSON)</label>
                <textarea
                  rows={3}
                  value={JSON.stringify(selectedNode.data.config?.variables || {}, null, 2)}
                  onChange={(event) => {
                    try {
                      const parsed = JSON.parse(event.target.value || '{}');
                      handleConfigChange('variables', parsed);
                    } catch {
                      // ignore invalid JSON
                    }
                  }}
                />

                <label>可选模型</label>
                <select
                  value={selectedNode.data.config?.model || ''}
                  onChange={(event) => handleConfigChange('model', event.target.value || undefined)}
                  disabled={!modelOptions.length}
                >
                  <option value="">-- 使用默认模型 --</option>
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                {modelLoadError && <div className={styles.hint}>{modelLoadError}</div>}

                <label>输出数量</label>
                <input
                  type="number"
                  min={1}
                  value={selectedNode.data.config?.outputCount || 1}
                  onChange={(event) => handleConfigChange('outputCount', Number(event.target.value))}
                />

                <label>需要人工审核</label>
                <select
                  value={selectedNode.data.config?.requireHuman ? 'yes' : 'no'}
                  onChange={(event) => handleConfigChange('requireHuman', event.target.value === 'yes')}
                >
                  <option value="no">否</option>
                  <option value="yes">是</option>
                </select>

                <label>自动通过</label>
                <select
                  value={selectedNode.data.config?.autoApprove ? 'yes' : 'no'}
                  onChange={(event) => handleConfigChange('autoApprove', event.target.value === 'yes')}
                >
                  <option value="no">否</option>
                  <option value="yes">是</option>
                </select>

                {selectedNode.data?.nodeType === WorkflowNodeType.HUMAN_BREAKPOINT && (
                  <>
                    <label>选择模式</label>
                    <select
                      value={selectedNode.data.config?.selectionMode || 'single'}
                      onChange={(event) => handleConfigChange('selectionMode', event.target.value)}
                    >
                      <option value="single">单选</option>
                      <option value="multiple">多选</option>
                    </select>
                  </>
                )}
              </>
            )}

            {isToolNode && (
              <div className={styles.toolInfo}>
                <div>工具名称: {selectedNode.data.toolName || selectedNode.data.label}</div>
                <div>Prompt 版本: {selectedNode.data.config?.promptTemplateVersionId || '-'}</div>
                <div>模型: {selectedNode.data.config?.model || '-'}</div>
              </div>
            )}

            <div className={styles.variableSection}>
              <h4>输入变量</h4>
              <div className={styles.variableHeader}>
                <span>变量名(唯一)</span>
                <span>类型</span>
                {showInputMapping && <span>输入映射</span>}
                <span>默认值</span>
                <span>必填</span>
                <span>操作</span>
              </div>
              {(selectedNode.data.inputs || []).map((item, index) => {
                const currentEdge = edges.find(
                  (edge) =>
                    edge.target === selectedNode.id &&
                    (edge as any).targetInputKey === item.key,
                );
                const currentValue = currentEdge
                  ? `${currentEdge.source}::${(currentEdge as any).sourceOutputKey}`
                  : '';
                return (
                  <div key={`inputs-${index}`} className={styles.variableRow}>
                    <input
                      value={item.key}
                      placeholder="变量名"
                      onChange={(event) => handleVariableChange('inputs', index, 'key', event.target.value)}
                    />
                    <select
                      value={item.type}
                      onChange={(event) =>
                        handleVariableChange('inputs', index, 'type', event.target.value as WorkflowValueType)
                      }
                    >
                      {VARIABLE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    {showInputMapping && (
                      <select
                        value={currentValue}
                        onChange={(event) => handleInputMappingChange(item, event.target.value)}
                      >
                        <option value="">-- 未绑定 --</option>
                        {outputOptions.map((option) => {
                          const compatibility = getTypeCompatibility(option.type, item.type);
                          return (
                            <option key={option.value} value={option.value} disabled={!compatibility.ok}>
                              {option.label}
                            </option>
                          );
                        })}
                      </select>
                    )}
                    <input
                      value={
                        item.defaultValue && typeof item.defaultValue === 'object'
                          ? JSON.stringify(item.defaultValue)
                          : item.defaultValue ?? ''
                      }
                      onChange={(event) => handleVariableChange('inputs', index, 'defaultValue', event.target.value)}
                      placeholder="default"
                    />
                    <label className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={!!item.required}
                        onChange={(event) => handleVariableChange('inputs', index, 'required', event.target.checked)}
                      />
                      必填
                    </label>
                    <button className="btn btn--outline btn--sm" onClick={() => handleRemoveVariable('inputs', index)}>
                      删除
                    </button>
                  </div>
                );
              })}
              <button className="btn btn--secondary btn--sm" onClick={() => handleAddVariable('inputs')}>
                添加输入
              </button>
            </div>

            {selectedNodeType !== WorkflowNodeType.START && (
              <div className={styles.variableSection}>
                <h4>输出变量</h4>
                <div className={styles.variableHeader}>
                  <span>变量名(唯一)</span>
                  <span>类型</span>
                  <span></span>
                  <span>操作</span>
                </div>
                {(selectedNode.data.outputs || []).map((item, index) => (
                  <div key={`outputs-${index}`} className={styles.variableRow}>
                    <input
                      value={item.key}
                      placeholder="变量名"
                      onChange={(event) => handleVariableChange('outputs', index, 'key', event.target.value)}
                    />
                    <select
                      value={item.type}
                      onChange={(event) =>
                        handleVariableChange('outputs', index, 'type', event.target.value as WorkflowValueType)
                      }
                    >
                      {VARIABLE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn--outline btn--sm" onClick={() => handleRemoveVariable('outputs', index)}>
                      删除
                    </button>
                  </div>
                ))}
                <button className="btn btn--secondary btn--sm" onClick={() => handleAddVariable('outputs')}>
                  添加输出
                </button>
              </div>
            )}
            {!isStartOrEnd && (
              <div className={styles.testSection}>
                <h4>节点测试</h4>
                {(selectedNode.data.inputs || []).map((input) => (
                  <div key={input.key} className={styles.testRow}>
                    <label>{input.name || input.key}</label>
                    {input.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={!!nodeTestInputs[selectedNode.id]?.[input.key]}
                        onChange={(event) => updateNodeTestInput(input.key, event.target.checked)}
                      />
                    ) : (
                      <textarea
                        rows={2}
                        value={nodeTestInputs[selectedNode.id]?.[input.key] ?? ''}
                        onChange={(event) => updateNodeTestInput(input.key, event.target.value)}
                      />
                    )}
                  </div>
                ))}
                <button className="btn btn--primary btn--sm" onClick={runNodeTest}>
                  运行节点测试
                </button>
                {nodeTestResults[selectedNode.id] && (
                  <pre className={styles.testOutput}>
                    {JSON.stringify(nodeTestResults[selectedNode.id], null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className={styles.empty}>选择节点以配置参数</p>
        )}

        <div className={styles.workflowTest}>
          <h3>工作流测试</h3>
          {!startNode && <div className={styles.empty}>未找到 Start 节点</div>}
          {hasAssetTestInputs && workflowTestAssetLoading && (
            <div className={styles.hint}>资产加载中...</div>
          )}
          {hasAssetTestInputs && workflowTestAssetError && (
            <div className={styles.validationError}>{workflowTestAssetError}</div>
          )}
          {hasAssetTestInputs && !workflowTestAssetLoading && !workflowTestAssetError && !workflowTestAssetSpaceId && (
            <div className={styles.hint}>未绑定资产空间，仅支持上传图片作为输入</div>
          )}
          {startNodeInputs.map((input) => (
            <div key={input.key} className={styles.testRow}>
              <label>{input.name || input.key}</label>
              {input.type === 'asset_ref' || input.type === 'list<asset_ref>' ? (
                (() => {
                  const isList = input.type === 'list<asset_ref>';
                  const rawValue = workflowTestInputs[input.key];
                  const selectedAssetIds = resolveTestInputAssetIds(rawValue);
                  const previewUrls = resolveTestInputMediaUrls(rawValue);
                  const selectValue = isList
                    ? selectedAssetIds.map((id) => String(id))
                    : selectedAssetIds[0]
                      ? String(selectedAssetIds[0])
                      : '';
                  return (
                    <div className={styles.assetInput}>
                      <div className={styles.assetControls}>
                        <input
                          type="file"
                          accept="image/*"
                          multiple={isList}
                          onChange={(event) => handleWorkflowTestAssetUpload(input.key, event.target.files, isList)}
                        />
                        {workflowTestAssetSpaceId && workflowTestSelectableAssets.length > 0 ? (
                          <select
                            value={selectValue}
                            multiple={isList}
                            onChange={(event) =>
                              handleWorkflowTestAssetSelect(
                                input.key,
                                event.target.value,
                                event.target.selectedOptions,
                                isList,
                              )
                            }
                          >
                            {!isList && <option value="">-- 选择空间资产 --</option>}
                            {workflowTestSelectableAssets.map((asset) => (
                              <option key={asset.id} value={String(asset.id)}>
                                #{asset.id} {asset.filename}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className={styles.hint}>上传图片会保存到空间并以 base64 发送</div>
                        )}
                      </div>
                      {previewUrls.length > 0 && (
                        <div className={styles.mediaPreview}>
                          {previewUrls.map((url) =>
                            isVideoUrl(url) ? (
                              <video key={url} src={url} controls className={styles.previewItem} />
                            ) : (
                              <img key={url} src={url} alt="workflow-input" className={styles.previewItem} />
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : input.type === 'boolean' ? (
                <input
                  type="checkbox"
                  checked={!!workflowTestInputs[input.key]}
                  onChange={(event) => updateWorkflowTestInput(input.key, event.target.checked)}
                />
              ) : (
                <textarea
                  rows={2}
                  value={workflowTestInputs[input.key] ?? ''}
                  onChange={(event) => updateWorkflowTestInput(input.key, event.target.value)}
                />
              )}
            </div>
          ))}
          <button className="btn btn--primary btn--sm" onClick={runWorkflowTest} disabled={workflowTestRunning || !startNode}>
            {workflowTestRunning ? '测试中...' : '运行工作流测试'}
          </button>
          {workflowTestError && <div className={styles.validationError}>{workflowTestError}</div>}
          {workflowTestResult && !workflowTestResult.ok && (
            <div className={styles.validationError}>{workflowTestResult.error || '工作流执行失败'}</div>
          )}
          {workflowTestResult && (
            <>
              <pre className={styles.testOutput}>
                {JSON.stringify(workflowTestResult.finalOutput || {}, null, 2)}
              </pre>
              {workflowTestMediaUrls.length > 0 && (
                <div className={styles.mediaPreview}>
                  {workflowTestMediaUrls.map((url) => {
                    const isVideo =
                      url.startsWith('data:video/') || /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(url);
                    return isVideo ? (
                      <video key={url} src={url} controls className={styles.previewItem} />
                    ) : (
                      <img key={url} src={url} alt="workflow-output" className={styles.previewItem} />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
};
