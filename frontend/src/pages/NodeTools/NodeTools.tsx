/**
 * Node tools management page
 * @module pages/NodeTools
 */

import { useEffect, useMemo, useState } from 'react';
import { nodeToolService, promptService, adminService } from '../../services';
import type { NodeTool, NodeToolTestResult } from '@shared/types/node-tool.types';
import type { PromptTemplateVersion } from '@shared/types/prompt.types';
import type { ProviderConfig } from '@shared/types/provider.types';
import type { WorkflowValueType, WorkflowVariable } from '@shared/types/workflow.types';
import { ProviderType } from '@shared/constants';
import styles from './NodeTools.module.scss';

const VARIABLE_TYPES: WorkflowValueType[] = [
  'text',
  'number',
  'boolean',
  'json',
  'image',
  'list<text>',
  'list<number>',
  'list<boolean>',
  'list<json>',
  'list<image>',
];

const MAX_NANO_BANANA_IMAGES = 3;

const isImageUrl = (value?: string) => {
  if (!value) return false;
  if (value.startsWith('data:image/')) return true;
  return /\.(png|jpg|jpeg|gif|webp)(\?|#|$)/i.test(value);
};

// 辅助函数：判断是否为图片输入类型（兼容 image 和旧的 asset_ref）
const isImageInputType = (type?: string) => type === 'image' || type === 'asset_ref';
const isImageListInputType = (type?: string) => type === 'list<image>' || type === 'list<asset_ref>';
const isAnyImageInputType = (type?: string) => isImageInputType(type) || isImageListInputType(type);

type ToolForm = {
  id?: number;
  name: string;
  description: string;
  promptTemplateVersionId?: number;
  model?: string;
  enabled: boolean;
  inputs: WorkflowVariable[];
  outputs: WorkflowVariable[];
};

type PromptVersionOption = PromptTemplateVersion & { templateName: string };

const emptyForm: ToolForm = {
  name: '',
  description: '',
  promptTemplateVersionId: undefined,
  model: undefined,
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

  const modelOptions = useMemo(() => {
    const options = providers
      .filter((provider) => provider.enabled)
      .flatMap((provider) =>
        (provider.models || []).map((model) => ({
          model,
          type: provider.type,
          label: `${provider.type} · ${model}`,
        })),
      );
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

  const isNanoBananaModel = useMemo(() => {
    if (!form.model) return false;
    const key = form.model.toLowerCase().replace(/[^a-z0-9]/g, '');
    return key === 'nanobanana';
  }, [form.model]);

  const supportsAssetInput =
    selectedProviderType === ProviderType.IMAGE || selectedProviderType === ProviderType.VIDEO;

  const previewImages = useMemo(() => {
    if (!testResult) return [];
    const urls = [...(testResult.mediaUrls || [])];
    if (testResult.outputText) urls.push(testResult.outputText);
    return Array.from(new Set(urls.filter((url) => isImageUrl(url))));
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

  useEffect(() => {
    loadTools();
    loadPromptVersions();
    loadProviders();
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

  const handleSelectTool = (tool: NodeTool) => {
    setForm({
      id: tool.id,
      name: tool.name,
      description: tool.description || '',
      promptTemplateVersionId: tool.promptTemplateVersionId || undefined,
      model: tool.model || undefined,
      enabled: tool.enabled,
      inputs: tool.inputs || [],
      outputs: tool.outputs || [],
    });
    setTestInputs({});
    setTestFiles({});
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name,
      description: form.description,
      promptTemplateVersionId: form.promptTemplateVersionId,
      model: form.model,
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
      const isAsset = isAnyImageInputType(input.type);
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
              if (form.model) formData.append('model', form.model);
              formData.append('inputs', JSON.stringify(parsedInputs));
              Object.entries(testFiles).forEach(([key, files]) => {
                (files || []).forEach((file) => formData.append(key, file));
              });
              return formData;
            })(),
          )
        : await nodeToolService.testNodeTool({
            promptTemplateVersionId: form.promptTemplateVersionId,
            model: form.model,
            inputs: parsedInputs,
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
              <option value="">选择 Prompt 模板版本</option>
              {promptVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.templateName} · {version.name || '未命名版本'}
                </option>
              ))}
            </select>
            {form.promptTemplateVersionId && (
              <div className={styles.variableHint}>
                Prompt 变量：
                {(promptVersions.find((item) => item.id === form.promptTemplateVersionId)?.variables || []).join(', ') ||
                  '无'}
              </div>
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
          {form.inputs.map((input) => (
            <div key={`test-${input.key}`} className={styles.testRow}>
              <label>{input.name || input.key}</label>
              {isAnyImageInputType(input.type) ? (
                supportsAssetInput ? (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      multiple={isImageListInputType(input.type)}
                      onChange={(event) =>
                        setTestFiles((prev) => {
                          const fileList = event.target.files ? Array.from(event.target.files) : [];
                          const limited =
                            isNanoBananaModel && isImageListInputType(input.type)
                              ? fileList.slice(0, MAX_NANO_BANANA_IMAGES)
                              : fileList;
                          return {
                            ...prev,
                            [input.key]: limited,
                          };
                        })
                      }
                    />
                    {!!testFiles[input.key]?.length && (
                      <div className={styles.fileHint}>
                        已选择: {testFiles[input.key].map((file) => file.name).join(', ')}
                      </div>
                    )}
                    {isNanoBananaModel && isImageListInputType(input.type) && (
                      <div className={styles.fileHint}>最多支持 {MAX_NANO_BANANA_IMAGES} 张图片</div>
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
            <pre className={styles.testOutput}>{JSON.stringify(testResult, null, 2)}</pre>
          )}
          {previewImages.length > 0 && (
            <div className={styles.imagePreview}>
              {previewImages.map((url, index) => (
                <img key={`${url}-${index}`} src={url} alt="Generated preview" />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
