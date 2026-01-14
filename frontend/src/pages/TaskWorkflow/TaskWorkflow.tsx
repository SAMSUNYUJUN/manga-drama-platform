/**
 * Task workflow execution page
 * @module pages/TaskWorkflow
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { TaskDetail } from '@shared/types/task.types';
import type { WorkflowRun, NodeRun, WorkflowTemplate, WorkflowTemplateVersion, WorkflowVariable } from '@shared/types/workflow.types';
import type { Asset } from '@shared/types/asset.types';
import { taskService, workflowService, scriptService } from '../../services';
import { WorkflowNodeType } from '@shared/constants';
import styles from './TaskWorkflow.module.scss';

export const TaskWorkflow = () => {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateVersionsMap, setTemplateVersionsMap] = useState<Record<number, WorkflowTemplateVersion[]>>({});
  const [templateVersions, setTemplateVersions] = useState<WorkflowTemplateVersion[]>([]);
  const [selectedTemplateVersionId, setSelectedTemplateVersionId] = useState<number | null>(null);
  const [selectedTemplateVersion, setSelectedTemplateVersion] = useState<WorkflowTemplateVersion | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [nodeRuns, setNodeRuns] = useState<NodeRun[]>([]);
  const [reviewAssets, setReviewAssets] = useState<Asset[]>([]);
  const [reviewDecisions, setReviewDecisions] = useState<Record<number, 'approve' | 'reject'>>({});
  const [startInputs, setStartInputs] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [breakpointSelections, setBreakpointSelections] = useState<number[]>([]);
  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [templateError, setTemplateError] = useState('');

  const waitingNode = useMemo(
    () => nodeRuns.find((node) => node.status === 'WAITING_HUMAN' || node.status === 'PAUSED'),
    [nodeRuns],
  );

  const waitingNodeDefinition = useMemo(() => {
    if (!waitingNode || !selectedTemplateVersion?.nodes) return null;
    return selectedTemplateVersion.nodes.find((node) => node.id === waitingNode.nodeId) || null;
  }, [waitingNode?.id, selectedTemplateVersion]);

  const selectionMode = useMemo(() => {
    const configMode = waitingNodeDefinition?.data?.config?.selectionMode;
    const outputMode = waitingNode?.output?.variables?.selectionMode;
    return outputMode || configMode || 'single';
  }, [waitingNodeDefinition, waitingNode]);

  const breakpointCandidates = useMemo(() => {
    if (!waitingNode || !waitingNodeDefinition) return [];
    const inputKey = (waitingNodeDefinition.data?.inputs || [])[0]?.key;
    const value = inputKey ? waitingNode.input?.variables?.[inputKey] : undefined;
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
  }, [waitingNode, waitingNodeDefinition]);

  const loadTask = async () => {
    if (!id) return;
    const data = await taskService.getTask(Number(id));
    setTask(data);
    setSelectedVersionId(data.currentVersionId || data.versions?.[0]?.id || null);
  };

  const loadTemplates = async () => {
    try {
      setTemplateError('');
      const data = await workflowService.listWorkflowTemplates();
      setTemplates(data);
      if (!data.length) {
        setSelectedTemplateId(null);
        setTemplateVersions([]);
        setSelectedTemplateVersionId(null);
        return;
      }
      const entries = await Promise.all(
        data.map(async (template) => ({
          templateId: template.id,
          versions: await workflowService.listWorkflowTemplateVersions(template.id),
        })),
      );
      const nextMap: Record<number, WorkflowTemplateVersion[]> = {};
      entries.forEach((entry) => {
        nextMap[entry.templateId] = entry.versions;
      });
      setTemplateVersionsMap(nextMap);
      const preferredTemplateId =
        (selectedTemplateId && data.some((template) => template.id === selectedTemplateId))
          ? selectedTemplateId
          : data[0].id;
      setSelectedTemplateId(preferredTemplateId);
      const versions = nextMap[preferredTemplateId] || [];
      setTemplateVersions(versions);
      setSelectedTemplateVersionId((prev) =>
        prev && versions.some((item) => item.id === prev) ? prev : versions[0]?.id || null,
      );
    } catch (error: any) {
      setTemplateError(error?.message || '工作流模板加载失败');
      setTemplates([]);
      setTemplateVersions([]);
      setSelectedTemplateId(null);
      setSelectedTemplateVersionId(null);
    }
  };

  const loadRun = async (taskId: number, versionId: number) => {
    try {
      const data = await workflowService.getWorkflowRun(taskId, versionId);
      setRun(data);
      const nodes = await workflowService.listNodeRuns(data.id);
      setNodeRuns(nodes);
    } catch {
      setRun(null);
      setNodeRuns([]);
    }
  };

  const loadReviewAssets = async () => {
    if (!waitingNode) return;
    const assets = await workflowService.getReviewAssets(waitingNode.id);
    setReviewAssets(assets);
    const defaults: Record<number, 'approve' | 'reject'> = {};
    assets.forEach((asset: Asset) => {
      defaults[asset.id] = 'approve';
    });
    setReviewDecisions(defaults);
  };

  useEffect(() => {
    loadTask();
    loadTemplates();
  }, [id]);

  useEffect(() => {
    if (task && selectedVersionId) {
      loadRun(task.id, selectedVersionId);
    }
  }, [task, selectedVersionId]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplateVersions([]);
      setSelectedTemplateVersionId(null);
      return;
    }
    const versions = templateVersionsMap[selectedTemplateId] || [];
    setTemplateVersions(versions);
    setSelectedTemplateVersionId((prev) =>
      prev && versions.some((item) => item.id === prev) ? prev : versions[0]?.id || null,
    );
  }, [selectedTemplateId, templateVersionsMap]);

  useEffect(() => {
    if (!selectedTemplateVersionId) {
      setSelectedTemplateVersion(null);
      return;
    }
    const version = templateVersions.find((item) => item.id === selectedTemplateVersionId) || null;
    setSelectedTemplateVersion(version);
    const startNode = version?.nodes?.find((node) => node.type === WorkflowNodeType.START);
    const inputs = (startNode?.data?.inputs || []) as WorkflowVariable[];
    const nextInputs: Record<string, any> = {};
    inputs.forEach((input) => {
      const value = input.defaultValue;
      if (value && typeof value === 'object') {
        nextInputs[input.key] = JSON.stringify(value, null, 2);
      } else {
        nextInputs[input.key] = value ?? '';
      }
    });
    setStartInputs(nextInputs);
  }, [selectedTemplateVersionId, templateVersions]);

  useEffect(() => {
    if (!run || !Object.keys(templateVersionsMap).length) return;
    const match = Object.entries(templateVersionsMap).find(([, versions]) =>
      versions.some((version) => version.id === run.templateVersionId),
    );
    if (!match) return;
    const templateId = Number(match[0]);
    if (selectedTemplateId !== templateId) {
      setSelectedTemplateId(templateId);
    }
    if (selectedTemplateVersionId !== run.templateVersionId) {
      setSelectedTemplateVersionId(run.templateVersionId);
    }
  }, [run?.templateVersionId, templateVersionsMap, selectedTemplateId, selectedTemplateVersionId]);

  useEffect(() => {
    if (waitingNode) {
      loadReviewAssets();
    }
  }, [waitingNode?.id]);

  useEffect(() => {
    setBreakpointSelections([]);
  }, [waitingNode?.id]);

  const handleStart = async () => {
    if (!task || !selectedVersionId || !selectedTemplateVersionId) return;
    const validation = await workflowService.validateWorkflowVersion(selectedTemplateVersionId);
    setValidationErrors(validation.errors.map((item) => item.message));
    setValidationWarnings(validation.warnings.map((item) => item.message));
    if (!validation.ok) return;
    const startNode = selectedTemplateVersion?.nodes?.find((node) => node.type === WorkflowNodeType.START);
    const inputs = (startNode?.data?.inputs || []) as WorkflowVariable[];
    const payloadInputs: Record<string, any> = {};
    inputs.forEach((input) => {
      const raw = startInputs[input.key];
      if (input.type === 'number') {
        payloadInputs[input.key] = raw === '' ? undefined : Number(raw);
        return;
      }
      if (input.type === 'boolean') {
        payloadInputs[input.key] = raw === true || raw === 'true';
        return;
      }
      if (input.type === 'json' || input.type.startsWith('list<')) {
        try {
          payloadInputs[input.key] = raw ? JSON.parse(raw) : raw;
          return;
        } catch {
          payloadInputs[input.key] = raw;
          return;
        }
      }
      payloadInputs[input.key] = raw;
    });
    const data = await workflowService.startWorkflowRun(
      task.id,
      selectedVersionId,
      selectedTemplateVersionId,
      payloadInputs,
    );
    setRun(data);
    const nodes = await workflowService.listNodeRuns(data.id);
    setNodeRuns(nodes);
  };

  const handleCancel = async () => {
    if (!run) return;
    await workflowService.cancelWorkflowRun(run.id);
    await loadRun(run.taskId, run.taskVersionId);
  };

  const handleRetry = async () => {
    if (!run) return;
    await workflowService.retryWorkflowRun(run.id);
    await loadRun(run.taskId, run.taskVersionId);
  };

  const handleReviewSubmit = async () => {
    if (!waitingNode) return;
    setIsSubmitting(true);
    const approved = Object.keys(reviewDecisions)
      .filter((id) => reviewDecisions[Number(id)] === 'approve')
      .map((id) => Number(id));
    const rejected = Object.keys(reviewDecisions)
      .filter((id) => reviewDecisions[Number(id)] === 'reject')
      .map((id) => Number(id));
    await workflowService.submitReviewDecision(waitingNode.id, {
      approvedAssetIds: approved,
      rejectedAssetIds: rejected,
    });
    await workflowService.continueReview(waitingNode.id);
    await loadRun(run!.taskId, run!.taskVersionId);
    setIsSubmitting(false);
  };

  const handleReviewUpload = async (file: File, replaceAssetId?: number) => {
    if (!waitingNode) return;
    await workflowService.uploadReviewAsset(waitingNode.id, file, { replaceAssetId });
    await loadReviewAssets();
  };

  const handleBreakpointSubmit = async () => {
    if (!run || !waitingNode) return;
    await workflowService.submitHumanSelect(run.id, {
      nodeRunId: waitingNode.id,
      selectedIndices: breakpointSelections,
    });
    setBreakpointSelections([]);
    await loadRun(run.taskId, run.taskVersionId);
  };

  const handleScriptUpload = async () => {
    if (!task || !selectedVersionId || !scriptFile) return;
    await scriptService.uploadScript(task.id, selectedVersionId, scriptFile);
    await scriptService.parseScript(task.id, selectedVersionId, {});
    setScriptFile(null);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>工作流执行面板</h1>
          <p>{task?.title || '加载中...'}</p>
        </div>
        <div className={styles.actions}>
          <button className="btn btn--primary" onClick={handleStart}>
            启动工作流
          </button>
          <button className="btn btn--secondary" onClick={handleRetry}>
            重试
          </button>
          <button className="btn btn--outline" onClick={handleCancel}>
            取消
          </button>
        </div>
      </header>

      <section className={styles.panelRow}>
        <div className={styles.panel}>
          <h3>选择工作流模板</h3>
          <select
            value={selectedTemplateId || ''}
            onChange={(event) =>
              setSelectedTemplateId(event.target.value ? Number(event.target.value) : null)
            }
          >
            <option value="">-- 选择模板 --</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          {templateError && <div className={styles.validationErrors}>{templateError}</div>}
          {!templates.length && <div>暂无可用工作流模板</div>}
        </div>
        <div className={styles.panel}>
          <h3>选择工作流模板版本</h3>
          <select
            value={selectedTemplateVersionId || ''}
            onChange={(event) =>
              setSelectedTemplateVersionId(event.target.value ? Number(event.target.value) : null)
            }
            disabled={!selectedTemplateId}
          >
            <option value="">-- 选择版本 --</option>
            {templateVersions.map((version) => (
              <option key={version.id} value={version.id}>
                v{version.version} (ID {version.id})
              </option>
            ))}
          </select>
          {selectedTemplateId && !templateVersions.length && <div>当前模板暂无版本</div>}
        </div>
        <div className={styles.panel}>
          <h3>Start 输入</h3>
          {Object.keys(startInputs).length === 0 && <div>未配置 Start 输入变量</div>}
          {Object.entries(startInputs).map(([key, value]) => (
            <div key={key} className={styles.startInputRow}>
              <label>{key}</label>
              <textarea
                rows={2}
                value={value}
                onChange={(event) =>
                  setStartInputs((prev) => ({
                    ...prev,
                    [key]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
        </div>
        <div className={styles.panel}>
          <h3>剧本上传 & 解析</h3>
          <input type="file" onChange={(event) => setScriptFile(event.target.files?.[0] || null)} />
          <button className="btn btn--secondary btn--sm" onClick={handleScriptUpload}>
            上传并解析
          </button>
        </div>
      </section>

      <section className={styles.panel}>
        <h3>运行状态</h3>
        <div className={styles.statusRow}>
          <div>状态: {run?.status || '未开始'}</div>
          <div>当前节点: {run?.currentNodeId || '-'}</div>
        </div>
        {!!validationErrors.length && (
          <div className={styles.validationErrors}>
            {validationErrors.map((item, index) => (
              <div key={`err-${index}`}>{item}</div>
            ))}
          </div>
        )}
        {!!validationWarnings.length && (
          <div className={styles.validationWarnings}>
            {validationWarnings.map((item, index) => (
              <div key={`warn-${index}`}>{item}</div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <h3>节点执行记录</h3>
        <div className={styles.nodeList}>
          {nodeRuns.map((node) => (
            <div key={node.id} className={styles.nodeItem}>
              <div>{node.nodeType}</div>
              <span className={styles.nodeStatus}>{node.status}</span>
            </div>
          ))}
        </div>
      </section>

      {waitingNode && waitingNode.nodeType === WorkflowNodeType.HUMAN_REVIEW_ASSETS && (
        <section className={styles.review}>
          <div className={styles.reviewHeader}>
            <h3>人工审核</h3>
            <button className="btn btn--primary" onClick={handleReviewSubmit} disabled={isSubmitting}>
              {isSubmitting ? '提交中...' : '提交并继续'}
            </button>
          </div>
          <div className={styles.reviewList}>
            {reviewAssets.map((asset) => (
              <div key={asset.id} className={styles.reviewItem}>
                <div>
                  <strong>#{asset.id}</strong> {asset.filename}
                </div>
                <div className={styles.reviewActions}>
                  <select
                    value={reviewDecisions[asset.id]}
                    onChange={(event) =>
                      setReviewDecisions((prev) => ({
                        ...prev,
                        [asset.id]: event.target.value as 'approve' | 'reject',
                      }))
                    }
                  >
                    <option value="approve">通过</option>
                    <option value="reject">丢弃</option>
                  </select>
                  <input
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleReviewUpload(file, asset.id);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {waitingNode && waitingNode.nodeType === WorkflowNodeType.HUMAN_BREAKPOINT && (
        <section className={styles.review}>
          <div className={styles.reviewHeader}>
            <h3>人工断点选择</h3>
            <button className="btn btn--primary" onClick={handleBreakpointSubmit} disabled={!breakpointSelections.length}>
              提交选择
            </button>
          </div>
          <div className={styles.reviewList}>
            {breakpointCandidates.map((item: any, index: number) => (
              <label key={`${waitingNode.id}-${index}`} className={styles.breakpointItem}>
                <input
                  type={selectionMode === 'multiple' ? 'checkbox' : 'radio'}
                  checked={breakpointSelections.includes(index)}
                  onChange={(event) => {
                    if (selectionMode !== 'multiple') {
                      setBreakpointSelections(event.target.checked ? [index] : []);
                      return;
                    }
                    setBreakpointSelections((prev) =>
                      event.target.checked ? [...prev, index] : prev.filter((i) => i !== index),
                    );
                  }}
                />
                <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
