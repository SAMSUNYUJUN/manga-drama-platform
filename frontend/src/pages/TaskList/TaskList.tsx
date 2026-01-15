/**
 * 任务列表页面
 * @module pages/TaskList
 */

import { useState, useEffect } from 'react';
import mammoth from 'mammoth';
import type { Task } from '@shared/types/task.types';
import type { WorkflowTemplate, WorkflowTemplateVersion, WorkflowVariable } from '@shared/types/workflow.types';
import type { AssetSpace } from '@shared/types/asset-space.types';
import type { Asset } from '@shared/types/asset.types';
import { WorkflowNodeType, AssetStatus } from '@shared/constants';
import { taskService, workflowService, assetSpaceService, assetService } from '../../services';
import styles from './TaskList.module.scss';

// 辅助函数
const isAssetRefType = (type?: string) => type === 'asset_ref';
const isAssetRefListType = (type?: string) => type === 'list<asset_ref>';
const isAnyAssetRefType = (type?: string) => isAssetRefType(type) || isAssetRefListType(type);
const isVideoUrl = (value?: string) => {
  if (!value) return false;
  if (value.startsWith('data:video/')) return true;
  return /\.(mp4|webm|mov|mkv)(\?|#|$)/i.test(value);
};
const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

interface TaskWithRun extends Task {
  workflowRunStatus?: string;
}

export const TaskList = () => {
  const [tasks, setTasks] = useState<TaskWithRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  // 编辑模态框状态
  const [editingTask, setEditingTask] = useState<TaskWithRun | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // 工作流模板相关
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateVersions, setTemplateVersions] = useState<WorkflowTemplateVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [startNodeInputs, setStartNodeInputs] = useState<WorkflowVariable[]>([]);
  const [workflowInputs, setWorkflowInputs] = useState<Record<string, any>>({});
  const [restoringConfig, setRestoringConfig] = useState(false); // 标记是否正在恢复历史配置

  // 资产空间相关
  const [assetSpaces, setAssetSpaces] = useState<AssetSpace[]>([]);
  const [spaceAssets, setSpaceAssets] = useState<Record<number, Asset[]>>({});
  const [selectedSpaceId, setSelectedSpaceId] = useState<Record<string, number | null>>({});

  // 执行状态
  const [executingTask, setExecutingTask] = useState<number | null>(null);

  useEffect(() => {
    loadTasks();
    loadTemplates();
    loadAssetSpaces();

    // 设置轮询
    const interval = setInterval(() => {
      loadTasks();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const loadTasks = async () => {
    try {
      const data = await taskService.getTasks();
      // 获取每个任务的工作流运行状态
      const tasksWithStatus = await Promise.all(
        data.items.map(async (task) => {
          try {
            if (task.currentVersionId) {
              const run = await workflowService.getWorkflowRun(task.id, task.currentVersionId);
              return { ...task, workflowRunStatus: run?.status };
            }
          } catch {
            // 忽略错误，可能没有运行记录
          }
          return { ...task };
        }),
      );
      setTasks(tasksWithStatus);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await workflowService.listWorkflowTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const loadAssetSpaces = async () => {
    try {
      const data = await assetSpaceService.listAssetSpaces();
      setAssetSpaces(data);
    } catch (err) {
      console.error('Failed to load asset spaces:', err);
    }
  };

  const loadSpaceAssets = async (spaceId: number) => {
    if (spaceAssets[spaceId]) return;
    try {
      const data = await assetService.listAssets({ spaceId, status: AssetStatus.ACTIVE, limit: 100 });
      setSpaceAssets((prev) => ({ ...prev, [spaceId]: data.items }));
    } catch (err) {
      console.error('Failed to load space assets:', err);
    }
  };

  // 加载模板版本
  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplateVersions([]);
      setSelectedVersionId(null);
      setStartNodeInputs([]);
      return;
    }

    const loadVersions = async () => {
      try {
        const versions = await workflowService.listWorkflowTemplateVersions(selectedTemplateId);
        setTemplateVersions(versions);
        // 如果不是恢复历史配置，则默认选择最新版本（versions 按 version DESC 排序，最新版在第一个）
        if (versions.length > 0 && !restoringConfig) {
          const latestVersion = versions[0];
          setSelectedVersionId(latestVersion.id);
        }
      } catch (err) {
        console.error('Failed to load versions:', err);
      }
    };

    loadVersions();
  }, [selectedTemplateId]);

  // 解析开始节点输入
  useEffect(() => {
    if (!selectedVersionId || !selectedTemplateId) {
      setStartNodeInputs([]);
      return;
    }

    const loadVersion = async () => {
      try {
        const version = await workflowService.getWorkflowTemplateVersion(selectedTemplateId, selectedVersionId);
        const startNode = version.nodes?.find(
          (node: any) => node.type === WorkflowNodeType.START || node.data?.nodeType === WorkflowNodeType.START,
        );
        if (startNode) {
          const inputs = startNode.data?.inputs || [];
          setStartNodeInputs(inputs);
          // 如果正在恢复配置，不覆盖已有输入值
          if (!restoringConfig) {
            const initialInputs: Record<string, any> = {};
            inputs.forEach((input: WorkflowVariable) => {
              initialInputs[input.key] = '';
            });
            setWorkflowInputs(initialInputs);
          } else {
            // 恢复完成后重置标记
            setRestoringConfig(false);
          }
        }
      } catch (err) {
        console.error('Failed to load version:', err);
      }
    };

    loadVersion();
  }, [selectedVersionId, selectedTemplateId, restoringConfig]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      await taskService.createTask({ title, description });
      setTitle('');
      setDescription('');
      await loadTasks();
    } catch (err: any) {
      setError(err?.message || '创建任务失败');
    }
  };

  const handleDelete = async (task: Task) => {
    if (!window.confirm(`确定删除任务「${task.title}」吗？`)) {
      return;
    }
    try {
      setError('');
      await taskService.deleteTask(task.id);
      await loadTasks();
    } catch (err: any) {
      setError(err?.message || '删除任务失败');
    }
  };

  const openEditModal = async (task: TaskWithRun) => {
    setEditingTask(task);
    setShowEditModal(true);
    // 先重置工作流配置
    setSelectedTemplateId(null);
    setSelectedVersionId(null);
    setStartNodeInputs([]);
    setWorkflowInputs({});
    setSelectedSpaceId({});
    setRestoringConfig(false);

    // 尝试加载之前的工作流运行配置
    if (task.currentVersionId) {
      try {
        const run = await workflowService.getWorkflowRun(task.id, task.currentVersionId);
        if (run && run.templateVersionId) {
          // 从版本列表中找到对应的模板
          const versions = await Promise.all(
            templates.map(async (t) => {
              try {
                const vers = await workflowService.listWorkflowTemplateVersions(t.id);
                return vers.map((v) => ({ ...v, templateIdFromParent: t.id }));
              } catch {
                return [];
              }
            }),
          );
          const allVersions = versions.flat();
          const matchedVersion = allVersions.find((v) => v.id === run.templateVersionId);
          
          if (matchedVersion) {
            // 标记正在恢复配置，防止 useEffect 覆盖输入值
            setRestoringConfig(true);
            // 设置之前的输入值
            if (run.input) {
              setWorkflowInputs(run.input);
            }
            // 设置选中的模板和版本
            setSelectedTemplateId(matchedVersion.templateIdFromParent);
            // 延迟设置版本，等待版本列表加载完成
            setTimeout(() => {
              setSelectedVersionId(run.templateVersionId);
            }, 100);
          }
        }
      } catch (err) {
        // 没有之前的运行记录，保持重置状态
        console.log('No previous workflow run found:', err);
      }
    }
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingTask(null);
  };

  const handleExecute = async () => {
    if (!editingTask || !selectedVersionId || !selectedTemplateId) {
      setError('请选择工作流模板和版本');
      return;
    }

    if (!editingTask.currentVersionId) {
      setError('任务版本不存在，请刷新页面后重试');
      return;
    }

    setExecutingTask(editingTask.id);
    setError('');

    try {
      // 先验证工作流
      const validation = await workflowService.validateWorkflowVersion(selectedVersionId);
      if (!validation.ok) {
        setError('工作流验证失败: ' + validation.errors.map((e: any) => e.message).join(', '));
        return;
      }

      await workflowService.startWorkflowRun(
        editingTask.id,
        editingTask.currentVersionId,
        selectedVersionId,
        workflowInputs,
      );
      closeEditModal();
      await loadTasks();
    } catch (err: any) {
      console.error('启动工作流失败:', err);
      const message = err?.response?.data?.message || err?.message || '启动工作流失败';
      setError(typeof message === 'string' ? message : JSON.stringify(message));
    } finally {
      setExecutingTask(null);
    }
  };

  const handleTextFileUpload = async (key: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const isDocx = file.name.endsWith('.docx') || 
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const isDoc = file.name.endsWith('.doc') || file.type === 'application/msword';
      
      if (isDocx) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setWorkflowInputs((prev) => ({ ...prev, [key]: result.value }));
      } else if (isDoc) {
        alert('不支持 .doc 格式，请将文件另存为 .docx 或 .txt 格式');
      } else {
        const text = await readFileAsText(file);
        setWorkflowInputs((prev) => ({ ...prev, [key]: text }));
      }
    } catch (err) {
      console.error('Failed to read file:', err);
      alert('读取文件失败');
    }
  };

  const handleAssetFileUpload = async (key: string, files: FileList | null, isList: boolean, spaceId?: number) => {
    if (!files || files.length === 0) return;
    
    if (spaceId) {
      try {
        const uploaded = await assetSpaceService.uploadAssetsToSpace(spaceId, Array.from(files));
        if (isList) {
          const urls = uploaded.map((a) => a.url);
          setWorkflowInputs((prev) => ({
            ...prev,
            [key]: [...(Array.isArray(prev[key]) ? prev[key] : []), ...urls],
          }));
        } else {
          setWorkflowInputs((prev) => ({ ...prev, [key]: uploaded[0]?.url || '' }));
        }
        const data = await assetService.listAssets({ spaceId, status: AssetStatus.ACTIVE, limit: 100 });
        setSpaceAssets((prev) => ({ ...prev, [spaceId]: data.items }));
      } catch (err) {
        console.error('Failed to upload:', err);
      }
    } else {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(file);
        urls.push(dataUrl);
      }
      if (isList) {
        setWorkflowInputs((prev) => ({
          ...prev,
          [key]: [...(Array.isArray(prev[key]) ? prev[key] : []), ...urls],
        }));
      } else {
        setWorkflowInputs((prev) => ({ ...prev, [key]: urls[0] || '' }));
      }
    }
  };

  const handleAssetSelect = (key: string, assetId: string, isList: boolean) => {
    const spaceId = selectedSpaceId[key];
    if (!spaceId) return;
    const assets = spaceAssets[spaceId] || [];
    const asset = assets.find((a) => String(a.id) === assetId);
    if (!asset) return;

    if (isList) {
      setWorkflowInputs((prev) => ({
        ...prev,
        [key]: [...(Array.isArray(prev[key]) ? prev[key] : []), asset.url],
      }));
    } else {
      setWorkflowInputs((prev) => ({ ...prev, [key]: asset.url }));
    }
  };

  const getTaskStatusLabel = (task: TaskWithRun) => {
    if (task.workflowRunStatus) {
      switch (task.workflowRunStatus) {
        case 'PENDING':
        case 'RUNNING':
          return '执行中';
        case 'SUCCEEDED':
          return '已完成';
        case 'FAILED':
          return '失败';
        case 'CANCELLED':
          return '已取消';
        case 'WAITING_HUMAN':
          return '等待人工';
        default:
          break;
      }
    }
    return '未开始';
  };

  const getTaskStatusClass = (task: TaskWithRun) => {
    const status = task.workflowRunStatus;
    if (status === 'SUCCEEDED') return styles.statusCompleted;
    if (status === 'RUNNING' || status === 'PENDING') return styles.statusProcessing;
    if (status === 'FAILED') return styles.statusFailed;
    return styles.statusNotStarted;
  };

  const isTaskRunning = (task: TaskWithRun) => {
    return task.workflowRunStatus === 'RUNNING' || task.workflowRunStatus === 'PENDING';
  };

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  return (
    <div className={styles.taskList}>
      <div className={styles.pageHeader}>
        <h1>任务列表</h1>
        <div className={styles.createForm}>
          <input
            placeholder="任务标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            placeholder="描述（可选）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button className={styles.btnPrimary} onClick={handleCreate}>
            创建任务
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {tasks.length === 0 ? (
        <div className={styles.emptyState}>
          <p>还没有任务，创建第一个吧！</p>
        </div>
      ) : (
        <div className={styles.tasksGrid}>
          {tasks.map((task) => (
            <div key={task.id} className={styles.taskCard}>
              <div className={styles.taskHeader}>
                <h3>{task.title}</h3>
                <span className={`${styles.status} ${getTaskStatusClass(task)}`}>
                  {getTaskStatusLabel(task)}
                </span>
              </div>
              <p className={styles.taskDesc}>{task.description || '无描述'}</p>
              <div className={styles.taskMeta}>
                <span className={styles.date}>
                  创建于 {new Date(task.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className={styles.taskActions}>
                <button
                  className={styles.btnEdit}
                  onClick={() => openEditModal(task)}
                  disabled={isTaskRunning(task)}
                >
                  编辑
                </button>
                <button
                  className={styles.btnExecute}
                  onClick={() => openEditModal(task)}
                  disabled={isTaskRunning(task)}
                >
                  {isTaskRunning(task) ? '执行中...' : '执行'}
                </button>
                <button
                  className={styles.btnDelete}
                  onClick={() => handleDelete(task)}
                  disabled={isTaskRunning(task)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑/执行模态框 */}
      {showEditModal && editingTask && (
        <div className={styles.modalOverlay} onClick={closeEditModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>配置任务: {editingTask.title}</h2>
              <button className={styles.closeBtn} onClick={closeEditModal}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.configRow}>
                <label>工作流模板</label>
                <select
                  value={selectedTemplateId || ''}
                  onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">-- 选择模板 --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTemplateId && (
                <div className={styles.configRow}>
                  <label>模板版本</label>
                  <select
                    value={selectedVersionId || ''}
                    onChange={(e) => setSelectedVersionId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">-- 选择版本 --</option>
                    {templateVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        版本 {v.version}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {startNodeInputs.length > 0 && (
                <div className={styles.inputsSection}>
                  <h4>工作流输入</h4>
                  {startNodeInputs.map((input) => (
                    <div key={input.key} className={styles.inputRow}>
                      <label>{input.name || input.key}</label>
                      {isAnyAssetRefType(input.type) ? (
                        <div className={styles.assetInput}>
                          <div className={styles.inputGroup}>
                            <select
                              value={selectedSpaceId[input.key] || ''}
                              onChange={(e) => {
                                const spaceId = e.target.value ? Number(e.target.value) : null;
                                setSelectedSpaceId((prev) => ({ ...prev, [input.key]: spaceId }));
                                if (spaceId) loadSpaceAssets(spaceId);
                              }}
                            >
                              <option value="">-- 选择资产空间 --</option>
                              {assetSpaces.map((space) => (
                                <option key={space.id} value={space.id}>
                                  {space.name}
                                </option>
                              ))}
                            </select>
                            {selectedSpaceId[input.key] && (
                              <select
                                onChange={(e) =>
                                  handleAssetSelect(input.key, e.target.value, isAssetRefListType(input.type))
                                }
                              >
                                <option value="">-- 选择资产 --</option>
                                {(spaceAssets[selectedSpaceId[input.key]!] || []).map((asset) => (
                                  <option key={asset.id} value={String(asset.id)}>
                                    {asset.filename}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div className={styles.uploadRow}>
                            <span>或上传文件：</span>
                            <input
                              type="file"
                              accept="image/*,video/*"
                              multiple={isAssetRefListType(input.type)}
                              onChange={(e) =>
                                handleAssetFileUpload(
                                  input.key,
                                  e.target.files,
                                  isAssetRefListType(input.type),
                                  selectedSpaceId[input.key] || undefined,
                                )
                              }
                            />
                          </div>
                          {workflowInputs[input.key] && (
                            <div className={styles.preview}>
                              {Array.isArray(workflowInputs[input.key]) ? (
                                workflowInputs[input.key].map((url: string, i: number) =>
                                  isVideoUrl(url) ? (
                                    <video key={i} src={url} controls className={styles.previewItem} />
                                  ) : (
                                    <img key={i} src={url} alt="" className={styles.previewItem} />
                                  ),
                                )
                              ) : isVideoUrl(workflowInputs[input.key]) ? (
                                <video src={workflowInputs[input.key]} controls className={styles.previewItem} />
                              ) : (
                                <img src={workflowInputs[input.key]} alt="" className={styles.previewItem} />
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={styles.textInput}>
                          <textarea
                            value={workflowInputs[input.key] || ''}
                            onChange={(e) => setWorkflowInputs((prev) => ({ ...prev, [input.key]: e.target.value }))}
                            placeholder={`输入 ${input.name || input.key}`}
                            rows={3}
                          />
                          <div className={styles.uploadRow}>
                            <span>或从文件导入：</span>
                            <input
                              type="file"
                              accept=".txt,.doc,.docx,text/plain"
                              onChange={(e) => handleTextFileUpload(input.key, e.target.files)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={closeEditModal}>
                取消
              </button>
              <button
                className={styles.btnPrimary}
                onClick={handleExecute}
                disabled={!selectedVersionId || executingTask === editingTask.id}
              >
                {executingTask === editingTask.id ? '执行中...' : '执行工作流'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
