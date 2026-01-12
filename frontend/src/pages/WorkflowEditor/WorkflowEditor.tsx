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
  Handle,
  Position,
} from 'reactflow';
import type { Connection, Edge, Node, NodeProps } from 'reactflow';
import 'reactflow/dist/style.css';
import { workflowService, promptService, adminService, nodeToolService } from '../../services';
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowValidationResult,
  WorkflowValueType,
  WorkflowVariable,
} from '@shared/types/workflow.types';
import type { PromptTemplateVersion } from '@shared/types/prompt.types';
import type { ProviderConfig } from '@shared/types/provider.types';
import type { NodeTool } from '@shared/types/node-tool.types';
import { ProviderType, WorkflowNodeType } from '@shared/constants';
import styles from './WorkflowEditor.module.scss';

type EditorNodeData = {
  label?: string;
  nodeType?: WorkflowNodeType | string;
  config: Record<string, any>;
  inputs?: WorkflowVariable[];
  outputs?: WorkflowVariable[];
  locked?: boolean;
};

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
    inputs: [],
    outputs: [{ key: 'input', name: '输入文本', type: 'text', required: true }],
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
    const inputs = data.inputs?.length ? data.inputs : defaults?.inputs || [];
    const outputs = data.outputs?.length ? data.outputs : defaults?.outputs || [];
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
    const sourceKey = (edge as any).sourceOutputKey || edge.sourceHandle || source?.data?.outputs?.[0]?.key;
    const targetKey = (edge as any).targetInputKey || edge.targetHandle || target?.data?.inputs?.[0]?.key;
    return {
      ...edge,
      sourceHandle: sourceKey,
      targetHandle: targetKey,
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

const VariableNode = ({ data }: NodeProps<EditorNodeData>) => {
  const inputs = data.inputs || [];
  const outputs = data.outputs || [];
  const isStart = data.nodeType === WorkflowNodeType.START;
  const isEnd = data.nodeType === WorkflowNodeType.END;
  return (
    <div className={styles.nodeCard}>
      <div className={styles.nodeTitle}>{data.label || data.nodeType}</div>
      <div className={styles.nodeBody}>
        <div className={styles.nodeColumn}>
          {inputs.map((input) => (
            <div key={input.key} className={styles.nodeRow}>
              <Handle
                type="target"
                position={Position.Left}
                id={input.key}
                isConnectable={!isStart}
              />
              <span className={styles.nodeLabel}>{input.name || input.key}</span>
              <span className={styles.nodeType}>{input.type}</span>
            </div>
          ))}
        </div>
        <div className={styles.nodeColumn}>
          {outputs.map((output) => (
            <div key={output.key} className={styles.nodeRow}>
              <span className={styles.nodeLabel}>{output.name || output.key}</span>
              <span className={styles.nodeType}>{output.type}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={output.key}
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
  const [nodeTestInputs, setNodeTestInputs] = useState<Record<string, Record<string, any>>>({});
  const [nodeTestResults, setNodeTestResults] = useState<Record<string, any>>({});

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId],
  );
  const isToolNode = selectedNode?.data?.nodeType === WorkflowNodeType.LLM_TOOL;

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
      const targetInputs = targetNode.data?.inputs || [];
      const sourceKey = connection.sourceHandle || sourceOutputs[0]?.key;
      if (!sourceKey) {
        showConnectionError('源节点没有可用输出变量');
        return;
      }
      const sourceVar = sourceOutputs.find((item) => item.key === sourceKey);
      if (!sourceVar) {
        showConnectionError('未找到源变量');
        return;
      }

      let targetKey = connection.targetHandle || targetInputs[0]?.key;
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
        sourceHandle: sourceKey,
        targetHandle: targetKey,
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
    const previousKey = selectedNode.data[group]?.[index]?.key;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== selectedNode.id) return node;
        const list = [...(node.data[group] || [])];
        list[index] = { ...list[index], [field]: value };
        return { ...node, data: { ...node.data, [group]: list } };
      }),
    );
    if (field === 'key' && previousKey && previousKey !== value) {
      setEdges((eds) =>
        eds.map((edge) => {
          if (group === 'inputs' && edge.target === selectedNode.id && (edge as any).targetInputKey === previousKey) {
            return {
              ...edge,
              targetHandle: value,
              targetInputKey: value,
            } as Edge;
          }
          if (group === 'outputs' && edge.source === selectedNode.id && (edge as any).sourceOutputKey === previousKey) {
            return {
              ...edge,
              sourceHandle: value,
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
        eds.filter((edge) =>
          group === 'inputs'
            ? (edge as any).targetInputKey !== variable.key
            : (edge as any).sourceOutputKey !== variable.key,
        ),
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
  };

  const loadPromptVersions = async () => {
    const prompts = await promptService.listPrompts();
    const versions: PromptTemplateVersion[] = [];
    for (const prompt of prompts) {
      const list = await promptService.listPromptVersions(prompt.id);
      list.forEach((version) => versions.push(version));
    }
    setPromptVersions(versions);
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
    const list = await nodeToolService.listNodeTools(true);
    setNodeTools(list);
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

  useEffect(() => {
    loadVersion();
    loadPromptVersions();
    loadProviders();
    loadNodeTools();
  }, [id, searchParams.toString()]);

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
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
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

            {selectedNode.data?.nodeType !== WorkflowNodeType.START &&
              selectedNode.data?.nodeType !== WorkflowNodeType.END &&
              !isToolNode && (
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
              {(selectedNode.data.inputs || []).map((item, index) => (
                <div key={item.key} className={styles.variableRow}>
                  <input
                    value={item.key}
                    onChange={(event) => handleVariableChange('inputs', index, 'key', event.target.value)}
                    disabled={isToolNode}
                  />
                  <input
                    value={item.name || ''}
                    onChange={(event) => handleVariableChange('inputs', index, 'name', event.target.value)}
                    disabled={isToolNode}
                  />
                  <select
                    value={item.type}
                    onChange={(event) =>
                      handleVariableChange('inputs', index, 'type', event.target.value as WorkflowValueType)
                    }
                    disabled={isToolNode}
                  >
                    {VARIABLE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <input
                    value={
                      item.defaultValue && typeof item.defaultValue === 'object'
                        ? JSON.stringify(item.defaultValue)
                        : item.defaultValue ?? ''
                    }
                    onChange={(event) => handleVariableChange('inputs', index, 'defaultValue', event.target.value)}
                    placeholder="default"
                    disabled={isToolNode}
                  />
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={!!item.required}
                      onChange={(event) => handleVariableChange('inputs', index, 'required', event.target.checked)}
                      disabled={isToolNode}
                    />
                    必填
                  </label>
                  {!isToolNode && (
                    <button className="btn btn--outline btn--sm" onClick={() => handleRemoveVariable('inputs', index)}>
                      删除
                    </button>
                  )}
                </div>
              ))}
              {!isToolNode && (
                <button className="btn btn--secondary btn--sm" onClick={() => handleAddVariable('inputs')}>
                  添加输入
                </button>
              )}
            </div>

            <div className={styles.variableSection}>
              <h4>输出变量</h4>
              {(selectedNode.data.outputs || []).map((item, index) => (
                <div key={item.key} className={styles.variableRow}>
                  <input
                    value={item.key}
                    onChange={(event) => handleVariableChange('outputs', index, 'key', event.target.value)}
                    disabled={isToolNode}
                  />
                  <input
                    value={item.name || ''}
                    onChange={(event) => handleVariableChange('outputs', index, 'name', event.target.value)}
                    disabled={isToolNode}
                  />
                  <select
                    value={item.type}
                    onChange={(event) =>
                      handleVariableChange('outputs', index, 'type', event.target.value as WorkflowValueType)
                    }
                    disabled={isToolNode}
                  >
                    {VARIABLE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  {!isToolNode && (
                    <button className="btn btn--outline btn--sm" onClick={() => handleRemoveVariable('outputs', index)}>
                      删除
                    </button>
                  )}
                </div>
              ))}
              {!isToolNode && (
                <button className="btn btn--secondary btn--sm" onClick={() => handleAddVariable('outputs')}>
                  添加输出
                </button>
              )}
            </div>

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
          </div>
        ) : (
          <p className={styles.empty}>选择节点以配置参数</p>
        )}
      </aside>
    </div>
  );
};
