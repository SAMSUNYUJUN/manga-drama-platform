/**
 * Node tools management page
 * @module pages/NodeTools
 */

import { useEffect, useMemo, useState } from 'react';
import { nodeToolService, promptService, adminService, assetSpaceService } from '../../services';
import type {
  NodeTool,
  NodeToolTestResult,
  ModelSpecificConfig,
  DoubaoSeedreamConfig,
  SoraVideoConfig,
  GeminiImageConfig,
} from '@shared/types/node-tool.types';
import { IMAGE_ASPECT_RATIOS } from '@shared/types/node-tool.types';
import type { PromptTemplateVersion } from '@shared/types/prompt.types';
import type { ProviderConfig } from '@shared/types/provider.types';
import type { WorkflowValueType, WorkflowVariable } from '@shared/types/workflow.types';
import type { AssetSpace } from '@shared/types/asset-space.types';
import { ProviderType } from '@shared/constants';
import styles from './NodeTools.module.scss';

const VARIABLE_TYPES: WorkflowValueType[] = [
  'text',
  'number',
  'boolean',
  'json',
  'asset_ref',
  'asset_file',
  'list<text>',
  'list<number>',
  'list<boolean>',
  'list<json>',
  'list<asset_ref>',
  'list<asset_file>',
];

const isImageUrl = (value?: string) => {
  if (!value) return false;
  if (value.startsWith('data:image/')) return true;
  return /\.(png|jpg|jpeg|gif|webp)(\?|#|$)/i.test(value);
};

const isVideoUrl = (value?: string) => {
  if (!value) return false;
  if (value.startsWith('data:video/')) return true;
  return /\.(mp4|webm|mov|avi)(\?|#|$)/i.test(value);
};

// 辅助函数：判断是否为资产引用类型（图片/视频URL）
const isAssetRefType = (type?: string) => type === 'asset_ref' || type === 'asset_file';
const isAssetRefListType = (type?: string) => type === 'list<asset_ref>' || type === 'list<asset_file>';
const isAnyAssetRefType = (type?: string) => isAssetRefType(type) || isAssetRefListType(type);

type ToolForm = {
  id?: number;
  name: string;
  description: string;
  promptTemplateVersionId?: number;
  /** System prompt version ID (for LLM nodes) */
  systemPromptVersionId?: number;
  model?: string;
  imageAspectRatio?: string;
  /** LLM max tokens (default: 1000) */
  maxTokens?: number;
  /** LLM temperature (default: 0.7) */
  temperature?: number;
  /** 模型特定配置 */
  modelConfig?: ModelSpecificConfig;
  enabled: boolean;
  inputs: WorkflowVariable[];
  outputs: WorkflowVariable[];
};

type PromptVersionOption = PromptTemplateVersion & { templateName: string };

/** 判断是否是 doubao-seedream 模型 */
const isDoubaoSeedreamModel = (model?: string) => {
  if (!model) return false;
  const key = model.toLowerCase().replace(/[^a-z0-9]/g, '');
  return key.includes('doubaoseedream') || key.includes('seedream');
};

const isGeminiImageModel = (model?: string) => {
  if (!model) return false;
  const key = model.toLowerCase().replace(/[^a-z0-9]/g, '');
  return key === 'gemini3proimagepreview' || key === 'gemini3proimage';
};

const isSoraModel = (model?: string) => {
  if (!model) return false;
  const key = model.toLowerCase().replace(/[^a-z0-9]/g, '');
  return key === 'sora' || key === 'sora2' || key === 'sora2pro' || key === 'veo31';
};

const emptyForm: ToolForm = {
  name: '',
  description: '',
  promptTemplateVersionId: undefined,
  systemPromptVersionId: undefined,
  model: undefined,
  imageAspectRatio: undefined,
  maxTokens: 8000,
  temperature: 0.7,
  modelConfig: undefined,
  enabled: true,
  inputs: [],
  outputs: [],
};

export const NodeTools = () => {
  const [tools, setTools] = useState<NodeTool[]>([]);
  const [form, setForm] = useState<ToolForm>(emptyForm);
  const [promptVersions, setPromptVersions] = useState<PromptVersionOption[]>([]);
  const [promptLoaded, setPromptLoaded] = useState(false);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [testInputs, setTestInputs] = useState<Record<string, any>>({});
  const [testFiles, setTestFiles] = useState<Record<string, File[]>>({});
  const [testResult, setTestResult] = useState<NodeToolTestResult | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [assetSpaces, setAssetSpaces] = useState<AssetSpace[]>([]);
  const [selectedTestSpaceId, setSelectedTestSpaceId] = useState<number | ''>('');

  const modelOptions = useMemo(() => {
    // 每个 provider 只取第一个模型（模型管理页面注册时 models 数组只有一个元素）
    const options = providers
      .filter((provider) => provider.enabled)
      .map((provider) => {
        const model = provider.models?.[0] || provider.name;
        return {
          model,
          type: provider.type,
          label: `${provider.type} · ${model}`,
        };
      });
    const seen = new Set<string>();
    return options.filter((option) => {
      const key = `${option.type}:${option.model}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [providers]);

  const selectedProviderType = useMemo(() => {
    if (!form.model) return ProviderType.LLM;
    return modelOptions.find((option) => option.model === form.model)?.type || ProviderType.LLM;
  }, [form.model, modelOptions]);

  const seedreamConfig = useMemo(() => (form.modelConfig || {}) as DoubaoSeedreamConfig, [form.modelConfig]);
  const soraConfig = useMemo(() => (form.modelConfig || {}) as SoraVideoConfig, [form.modelConfig]);
  const geminiConfig = useMemo(() => (form.modelConfig || {}) as GeminiImageConfig, [form.modelConfig]);

  // Aspect ratio selector not needed after removing jimeng video
  const showAspectRatio = false;

  const supportsAssetInput =
    selectedProviderType === ProviderType.IMAGE ||
    selectedProviderType === ProviderType.VIDEO ||
    isSoraModel(form.model) ||
    isGeminiImageModel(form.model);

  const previewImages = useMemo(() => {
    if (!testResult) return [];
    const urls = [...(testResult.mediaUrls || [])];
    if (testResult.outputText) urls.push(testResult.outputText);
    return Array.from(new Set(urls.filter((url) => isImageUrl(url))));
  }, [testResult]);

  // Video preview URLs
  const previewVideos = useMemo(() => {
    if (!testResult) return [];
    const savedUrls = testResult.savedAssets?.map((a) => a.url).filter(isVideoUrl);
    if (savedUrls && savedUrls.length) {
      return Array.from(new Set(savedUrls));
    }
    if (testResult.mediaUrls?.length) {
      const first = testResult.mediaUrls.find((url) => isVideoUrl(url));
      return first ? [first] : [];
    }
    if (testResult.outputText && isVideoUrl(testResult.outputText)) {
      return [testResult.outputText];
    }
    return [];
  }, [testResult]);

  const loadTools = async () => {
    const data = await nodeToolService.listNodeTools();
    setTools(data);
  };

  const loadPromptVersions = async () => {
    const prompts = await promptService.listPrompts();
    const versions: PromptVersionOption[] = [];
    for (const prompt of prompts) {
      const list = await promptService.listPromptVersions(prompt.id);
      list.forEach((version) => versions.push({ ...version, templateName: prompt.name }));
    }
    setPromptVersions(versions);
    setPromptLoaded(true);
  };

  const loadProviders = async () => {
    const list = await adminService.listProviders();
    setProviders(list);
  };

  const loadAssetSpaces = async () => {
    try {
      const list = await assetSpaceService.listAssetSpaces();
      setAssetSpaces(list);
    } catch (error) {
      console.error('[node-tools] failed to load asset spaces', error);
    }
  };

  useEffect(() => {
    loadTools();
    loadPromptVersions();
    loadProviders();
    loadAssetSpaces();
  }, []);

  useEffect(() => {
    if (!promptLoaded) return;
    if (!form.promptTemplateVersionId) return;
    const exists = promptVersions.some((version) => version.id === form.promptTemplateVersionId);
    if (!exists) {
      setForm((prev) => ({ ...prev, promptTemplateVersionId: undefined }));
    }
  }, [promptLoaded, promptVersions, form.promptTemplateVersionId]);

  useEffect(() => {
    if (!supportsAssetInput) {
      setTestFiles({});
    }
  }, [supportsAssetInput]);

  useEffect(() => {
    if (!form.promptTemplateVersionId) return;
    const version = promptVersions.find((item) => item.id === form.promptTemplateVersionId);
    if (!version || !version.variables?.length) return;
    setForm((prev) => {
      const existing = prev.inputs || [];
      const existingKeys = new Set(existing.map((item) => item.key));
      const additions = version.variables
        .filter((variable) => !existingKeys.has(variable))
        .map((variable) => ({
          key: variable,
          name: variable,
          type: 'text' as WorkflowValueType,
          required: true,
        }));
      if (!additions.length) return prev;
      return { ...prev, inputs: [...existing, ...additions] };
    });
  }, [form.promptTemplateVersionId, promptVersions]);

  useEffect(() => {
    if (!isSoraModel(form.model)) return;
    setForm((prev) => {
      const exists = prev.inputs.some((item) => item.key === 'input_reference');
      if (exists) return prev;
      return {
        ...prev,
        inputs: [
          ...prev.inputs,
          { key: 'input_reference', name: '参考图', type: 'asset_file' as WorkflowValueType, required: false },
        ],
      };
    });
  }, [form.model]);

  const handleSelectTool = (tool: NodeTool) => {
    setForm({
      id: tool.id,
      name: tool.name,
      description: tool.description || '',
      promptTemplateVersionId: tool.promptTemplateVersionId || undefined,
      systemPromptVersionId: tool.systemPromptVersionId || undefined,
      model: tool.model || undefined,
      imageAspectRatio: tool.imageAspectRatio || undefined,
      maxTokens: tool.maxTokens ?? 8000,
      temperature: tool.temperature ?? 0.7,
      modelConfig: tool.modelConfig || undefined,
      enabled: tool.enabled,
      inputs: tool.inputs || [],
      outputs: tool.outputs || [],
    });
    setTestInputs({});
    setTestFiles({});
    setTestResult(null);
    setSelectedTestSpaceId('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name,
      description: form.description,
      promptTemplateVersionId: form.promptTemplateVersionId,
      systemPromptVersionId: form.systemPromptVersionId,
      model: form.model,
      imageAspectRatio: form.imageAspectRatio,
      maxTokens: form.maxTokens,
      temperature: form.temperature,
      modelConfig: form.modelConfig,
      enabled: form.enabled,
      inputs: form.inputs,
      outputs: form.outputs,
    };
    if (form.id) {
      await nodeToolService.updateNodeTool(form.id, payload);
    } else {
      await nodeToolService.createNodeTool(payload as any);
    }
    await loadTools();
  };

  const handleDelete = async (event: React.MouseEvent, tool: NodeTool) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`确定删除节点工具「${tool.name}」吗？已有工作流引用将失效。`)) return;
    setDeletingId(tool.id);
    try {
      await nodeToolService.deleteNodeTool(tool.id);
      await loadTools();
      if (form.id === tool.id) {
        setForm(emptyForm);
        setTestInputs({});
        setTestResult(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddVariable = (group: 'inputs' | 'outputs') => {
    const list = [...form[group]];
    const prefix = group === 'inputs' ? 'input' : 'output';
    const key = `${prefix}_${list.length + 1}`;
    list.push({ key, name: key, type: 'text', required: false });
    setForm({ ...form, [group]: list });
  };

  const handleVariableChange = (
    group: 'inputs' | 'outputs',
    index: number,
    field: keyof WorkflowVariable,
    value: any,
  ) => {
    const list = [...form[group]];
    const prev = list[index];
    const next = { ...prev, [field]: value };
    if (field === 'key') {
      if (!prev?.name || prev.name === prev.key) {
        next.name = value;
      }
    }
    list[index] = next;
    setForm({ ...form, [group]: list });
  };

  const handleRemoveVariable = (group: 'inputs' | 'outputs', index: number) => {
    const list = [...form[group]];
    list.splice(index, 1);
    setForm({ ...form, [group]: list });
  };

  const handleTest = async () => {
    const parsedInputs: Record<string, any> = {};
    form.inputs.forEach((input) => {
      const isAsset = isAnyAssetRefType(input.type);
      const fileList = testFiles[input.key];
      if (supportsAssetInput && isAsset && fileList && fileList.length) {
        return;
      }
      const raw = testInputs[input.key];
      if (input.type === 'number') {
        parsedInputs[input.key] = raw === '' ? undefined : Number(raw);
        return;
      }
      if (input.type === 'boolean') {
        parsedInputs[input.key] = raw === true || raw === 'true';
        return;
      }
      if (input.type === 'json' || input.type.startsWith('list<')) {
        try {
          parsedInputs[input.key] = raw ? JSON.parse(raw) : raw;
          return;
        } catch {
          parsedInputs[input.key] = raw;
          return;
        }
      }
      parsedInputs[input.key] = raw;
    });

    if (!form.promptTemplateVersionId) {
      setTestResult({
        renderedPrompt: '',
        outputText: '',
        parsedJson: undefined,
        missingVariables: [],
        durationMs: 0,
        error: '请选择 Prompt 模板版本后再测试',
      });
      return;
    }

    try {
      const hasFiles = Object.values(testFiles).some((files) => files && files.length);
      const result = hasFiles
        ? await nodeToolService.testNodeToolWithFiles(
            (() => {
              const formData = new FormData();
              formData.append('promptTemplateVersionId', String(form.promptTemplateVersionId));
              if (form.systemPromptVersionId) formData.append('systemPromptVersionId', String(form.systemPromptVersionId));
              if (form.model) formData.append('model', form.model);
              // Only send imageAspectRatio for non-doubao-seedream models
              if (form.imageAspectRatio && !isDoubaoSeedreamModel(form.model)) {
                formData.append('imageAspectRatio', form.imageAspectRatio);
              }
              if (form.maxTokens !== undefined) formData.append('maxTokens', String(form.maxTokens));
              if (form.temperature !== undefined) formData.append('temperature', String(form.temperature));
              if (form.modelConfig) formData.append('modelConfig', JSON.stringify(form.modelConfig));
              if (selectedTestSpaceId) formData.append('spaceId', String(selectedTestSpaceId));
              formData.append('inputs', JSON.stringify(parsedInputs));
              if (form.outputs.length > 0) formData.append('outputs', JSON.stringify(form.outputs));
              Object.entries(testFiles).forEach(([key, files]) => {
                (files || []).forEach((file) => formData.append(key, file));
              });
              return formData;
            })(),
          )
        : await nodeToolService.testNodeTool({
            promptTemplateVersionId: form.promptTemplateVersionId,
            systemPromptVersionId: form.systemPromptVersionId,
            model: form.model,
            // Only send imageAspectRatio for non-doubao-seedream models
            imageAspectRatio: isDoubaoSeedreamModel(form.model) ? undefined : form.imageAspectRatio,
            maxTokens: form.maxTokens,
            temperature: form.temperature,
            modelConfig: form.modelConfig,
            inputs: parsedInputs,
            outputs: form.outputs.length > 0 ? form.outputs : undefined,
            spaceId: selectedTestSpaceId ? Number(selectedTestSpaceId) : undefined,
          });
      setTestResult(result);
    } catch (error: any) {
      const details = [
        error?.status ? `status=${error.status}` : '',
        error?.code ? `code=${error.code}` : '',
        error?.url ? `url=${error.url}` : '',
        error?.isTimeout ? 'timeout=true' : '',
        error?.isCanceled ? 'canceled=true' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const message = details ? `${error?.message || '测试失败'} (${details})` : error?.message || '测试失败';
      console.error('[node-tools/test] failed', {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        url: error?.url,
        isTimeout: error?.isTimeout,
        isCanceled: error?.isCanceled,
      });
      setTestResult({
        renderedPrompt: '',
        outputText: '',
        parsedJson: undefined,
        missingVariables: [],
        durationMs: 0,
        error: message,
      });
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>节点工具管理</h1>
        <p>定义 LLM + Prompt 模板的节点工具，并用于工作流编排</p>
      </header>

      <div className={styles.layout}>
        <aside className={styles.list}>
          <button className="btn btn--secondary btn--sm" onClick={() => setForm(emptyForm)}>
            新建工具
          </button>
          {tools.map((tool) => (
            <div key={tool.id} className={styles.item} onClick={() => handleSelectTool(tool)}>
              <div className={styles.itemHeader}>
                <div className={styles.title}>{tool.name}</div>
                <button
                  className="btn btn--outline btn--sm"
                  onClick={(event) => handleDelete(event, tool)}
                  disabled={deletingId === tool.id}
                >
                  删除
                </button>
              </div>
              <div className={styles.meta}>
                {tool.model || 'default'} · {tool.enabled ? '启用' : '停用'}
              </div>
            </div>
          ))}
        </aside>

        <section className={styles.panel}>
          <h3>工具配置</h3>
          <div className={styles.form}>
            <input
              placeholder="工具名称"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <input
              placeholder="描述"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <select
              value={form.promptTemplateVersionId || ''}
              onChange={(event) =>
                setForm({
                  ...form,
                  promptTemplateVersionId: event.target.value ? Number(event.target.value) : undefined,
                })
              }
            >
              <option value="">选择 User Prompt 模板版本</option>
              {promptVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.templateName} · {version.name || '未命名版本'}
                </option>
              ))}
            </select>
            {form.promptTemplateVersionId && (
              <div className={styles.variableHint}>
                User Prompt 变量：
                {(promptVersions.find((item) => item.id === form.promptTemplateVersionId)?.variables || []).join(', ') ||
                  '无'}
              </div>
            )}
            {selectedProviderType === ProviderType.LLM && (
              <>
                <select
                  value={form.systemPromptVersionId || ''}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      systemPromptVersionId: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                >
                  <option value="">选择 System Prompt 模板版本（可选）</option>
                  {promptVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.templateName} · {version.name || '未命名版本'}
                    </option>
                  ))}
                </select>
                {form.systemPromptVersionId && (
                  <div className={styles.variableHint}>
                    System Prompt 变量：
                    {(promptVersions.find((item) => item.id === form.systemPromptVersionId)?.variables || []).join(', ') ||
                      '无'}
                  </div>
                )}
              </>
            )}
            <select
              value={form.model || ''}
              onChange={(event) => setForm({ ...form, model: event.target.value || undefined })}
            >
              <option value="">使用默认模型</option>
              {modelOptions.map((option) => (
                <option key={`${option.type}:${option.model}`} value={option.model}>
                  {option.label}
                </option>
              ))}
            </select>
            {selectedProviderType === ProviderType.LLM && (
              <div className={styles.modelOptions}>
                <div className={styles.llmParams}>
                  <label>
                    Max Tokens
                    <input
                      type="number"
                      min={1}
                      max={128000}
                      value={form.maxTokens ?? 1000}
                      onChange={(event) => setForm({ ...form, maxTokens: Number(event.target.value) || 1000 })}
                    />
                  </label>
                  <label>
                    Temperature
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={form.temperature ?? 0.7}
                      onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) || 0.7 })}
                    />
                  </label>
                </div>
              </div>
            )}
            {showAspectRatio && !isDoubaoSeedreamModel(form.model) && (
              <div className={styles.modelOptions}>
                <label>生成媒体比例</label>
                <select
                  value={form.imageAspectRatio || ''}
                  onChange={(event) => setForm({ ...form, imageAspectRatio: event.target.value || undefined })}
                >
                  <option value="">-- 选择比例 --</option>
                  {IMAGE_ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* Doubao Seedream 模型特定配置 */}
            {isDoubaoSeedreamModel(form.model) && (
              <div className={styles.modelOptions}>
                <h4>Doubao Seedream 配置</h4>
                <div className={styles.seedreamConfig}>
                  <label>
                    图像尺寸 (size)
                    <input
                      type="text"
                      placeholder="1K / 2K / 4K 或 2048x2048"
                      value={seedreamConfig?.size || ''}
                      onChange={(e) => setForm({ 
                        ...form, 
                        modelConfig: { ...seedreamConfig, size: e.target.value || undefined }
                      })}
                    />
                    <small>方式1: 1K/2K/4K，方式2: 宽x高（如 2048x2048）</small>
                  </label>
                  <label>
                    组图功能 (sequential_image_generation)
                    <select
                      value={seedreamConfig?.sequential_image_generation || 'disabled'}
                      onChange={(e) => setForm({
                        ...form,
                        modelConfig: { 
                          ...seedreamConfig, 
                          sequential_image_generation: e.target.value as 'auto' | 'disabled',
                          // 如果切换到 disabled，清除 max_images
                          max_images: e.target.value === 'disabled' ? undefined : seedreamConfig?.max_images,
                        }
                      })}
                    >
                      <option value="disabled">disabled（关闭组图）</option>
                      <option value="auto">auto（自动判断）</option>
                    </select>
                  </label>
                  {seedreamConfig?.sequential_image_generation === 'auto' && (
                    <label>
                      最大图片数量 (max_images)
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={seedreamConfig?.max_images || 1}
                        onChange={(e) => setForm({
                          ...form,
                          modelConfig: { ...seedreamConfig, max_images: Number(e.target.value) || 1 }
                        })}
                      />
                    </label>
                  )}
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={seedreamConfig?.watermark ?? false}
                      onChange={(e) => setForm({
                        ...form,
                        modelConfig: { ...seedreamConfig, watermark: e.target.checked }
                      })}
                    />
                    添加水印 (watermark)
                  </label>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={seedreamConfig?.stream ?? false}
                      onChange={(e) => setForm({
                        ...form,
                        modelConfig: { ...seedreamConfig, stream: e.target.checked }
                      })}
                    />
                    流式输出 (stream)
                  </label>
                  <label>
                    响应格式 (response_format)
                    <select
                      value={seedreamConfig?.response_format || 'url'}
                      onChange={(e) => setForm({
                        ...form,
                        modelConfig: { 
                          ...seedreamConfig, 
                          response_format: e.target.value as 'url' | 'b64_json' 
                        }
                      })}
                    >
                      <option value="url">url（返回URL）</option>
                      <option value="b64_json">b64_json（返回Base64）</option>
                    </select>
                  </label>
                </div>
                <p className={styles.hint}>
                  💡 参考图：添加类型为 <code>asset_ref</code> 或 <code>list&lt;asset_ref&gt;</code> 的输入变量，
                  将自动作为参考图传入 image 参数
                </p>
              </div>
            )}
            {/* Gemini Image 模型配置 */}
            {isGeminiImageModel(form.model) && (
              <div className={styles.modelOptions}>
                <h4>Gemini 图片参数</h4>
                <label>
                  输出比例 (aspectRatio)
                  <input
                    type="text"
                    placeholder="如 16:9"
                    value={geminiConfig?.imageConfig?.aspectRatio || ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        modelConfig: {
                          ...geminiConfig,
                          imageConfig: {
                            ...(geminiConfig?.imageConfig || {}),
                            aspectRatio: e.target.value || undefined,
                            imageSize: geminiConfig?.imageConfig?.imageSize,
                          },
                        },
                      })
                    }
                  />
                </label>
                <label>
                  输出尺寸 (imageSize)
                  <input
                    type="text"
                    placeholder="如 4K / 2K / 1024x1024"
                    value={geminiConfig?.imageConfig?.imageSize || ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        modelConfig: {
                          ...geminiConfig,
                          imageConfig: {
                            ...(geminiConfig?.imageConfig || {}),
                            imageSize: e.target.value || undefined,
                            aspectRatio: geminiConfig?.imageConfig?.aspectRatio,
                          },
                        },
                      })
                    }
                  />
                </label>
              </div>
            )}
            {isSoraModel(form.model) && (
              <div className={styles.modelOptions}>
                <h4>Sora 参数</h4>
                <label>
                  输出尺寸 (size)
                  <input
                    type="text"
                    placeholder="默认使用参考图尺寸，例如 1280x720"
                    value={soraConfig?.size || ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        modelConfig: { ...soraConfig, size: e.target.value || undefined },
                      })
                    }
                  />
                  <small>留空时会自动读取上传参考图的宽高</small>
                </label>
                <label>
                  视频时长 (seconds)
                  <select
                    value={soraConfig?.seconds === 15 ? 15 : 10}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        modelConfig: { ...soraConfig, seconds: Number(e.target.value) },
                      })
                    }
                  >
                    <option value={10}>10 秒</option>
                    <option value={15}>15 秒</option>
                  </select>
                </label>
              </div>
            )}
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
              启用
            </label>

            <div className={styles.variableSection}>
              <h4>输入变量</h4>
              <div className={styles.variableHint}>变量标识用于连线/映射，显示名用于 UI（可留空）</div>
              {form.inputs.map((item, index) => (
                <div key={`input-${index}`} className={styles.variableRow}>
                  <input
                    value={item.key}
                    onChange={(event) => handleVariableChange('inputs', index, 'key', event.target.value)}
                    placeholder="变量标识"
                  />
                  <input
                    value={item.name || ''}
                    onChange={(event) => handleVariableChange('inputs', index, 'name', event.target.value)}
                    placeholder="显示名称（可选）"
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
              ))}
              <button className="btn btn--secondary btn--sm" onClick={() => handleAddVariable('inputs')}>
                添加输入
              </button>
            </div>

            <div className={styles.variableSection}>
              <h4>输出变量</h4>
              <div className={styles.variableHint}>变量标识用于连线/映射，显示名用于 UI（可留空）</div>
              {form.outputs.map((item, index) => (
                <div key={`output-${index}`} className={styles.variableRow}>
                  <input
                    value={item.key}
                    onChange={(event) => handleVariableChange('outputs', index, 'key', event.target.value)}
                    placeholder="变量标识"
                  />
                  <input
                    value={item.name || ''}
                    onChange={(event) => handleVariableChange('outputs', index, 'name', event.target.value)}
                    placeholder="显示名称（可选）"
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

            <button className="btn btn--primary" onClick={handleSave}>
              保存工具
            </button>
          </div>
        </section>

        <section className={styles.panel}>
          <h3>单次测试</h3>
          {isSoraModel(form.model) && (
            <div className={styles.testRow}>
              <label>保存到资产空间</label>
              <select
                value={selectedTestSpaceId || ''}
                onChange={(event) =>
                  setSelectedTestSpaceId(event.target.value ? Number(event.target.value) : '')
                }
              >
                <option value="">-- 选择资产空间 --</option>
                {assetSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {form.inputs.map((input) => (
            <div key={`test-${input.key}`} className={styles.testRow}>
              <label>{input.name || input.key}</label>
              {isAnyAssetRefType(input.type) ? (
                supportsAssetInput ? (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      multiple={isAssetRefListType(input.type)}
                      onChange={(event) =>
                        setTestFiles((prev) => {
                          const fileList = event.target.files ? Array.from(event.target.files) : [];
                          return {
                            ...prev,
                            [input.key]: fileList,
                          };
                        })
                      }
                    />
                    {!!testFiles[input.key]?.length && (
                      <div className={styles.fileHint}>
                        已选择: {testFiles[input.key].map((file) => file.name).join(', ')}
                      </div>
                    )}
                  </>
                ) : (
                  <textarea
                    rows={2}
                    value={testInputs[input.key] ?? ''}
                    placeholder="输入资产 URL"
                    onChange={(event) =>
                      setTestInputs((prev) => ({ ...prev, [input.key]: event.target.value }))
                    }
                  />
                )
              ) : input.type === 'boolean' ? (
                <input
                  type="checkbox"
                  checked={!!testInputs[input.key]}
                  onChange={(event) =>
                    setTestInputs((prev) => ({ ...prev, [input.key]: event.target.checked }))
                  }
                />
              ) : (
                <textarea
                  rows={2}
                  value={testInputs[input.key] ?? ''}
                  onChange={(event) =>
                    setTestInputs((prev) => ({ ...prev, [input.key]: event.target.value }))
                  }
                />
              )}
            </div>
          ))}
          <button className="btn btn--secondary" onClick={handleTest}>
            运行测试
          </button>
          {testResult && (
            <div className={styles.testResultContainer}>
              {testResult.error && (
                <div className={styles.testError}>❌ {testResult.error}</div>
              )}
              {testResult.durationMs > 0 && (
                <div className={styles.testDuration}>⏱️ 耗时: {(testResult.durationMs / 1000).toFixed(2)}s</div>
              )}
              {!!testResult.savedAssets?.length && (
                <div className={styles.savedJsonAssets}>
                  <strong>📁 已保存到资产空间:</strong>
                  <div className={styles.assetLinks}>
                    {testResult.savedAssets.map((asset) => (
                      <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer">
                        {asset.filename}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <pre className={styles.testOutput}>{JSON.stringify(testResult, null, 2)}</pre>
            </div>
          )}
          {previewImages.length > 0 && (
            <div className={styles.imagePreview}>
              {previewImages.map((url, index) => (
                <img key={`${url}-${index}`} src={url} alt="Generated preview" />
              ))}
            </div>
          )}
          {previewVideos.length > 0 && (
            <div className={styles.videoPreview}>
              {previewVideos.map((url, index) => (
                <video key={`${url}-${index}`} src={url} controls autoPlay muted loop />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
