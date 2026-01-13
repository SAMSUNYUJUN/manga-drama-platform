/**
 * Workflow templates page
 * @module pages/Workflows
 */

import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetSpaceService, workflowService } from '../../services';
import type { WorkflowTemplate } from '@shared/types/workflow.types';
import type { AssetSpace } from '@shared/types/asset-space.types';
import styles from './Workflows.module.scss';

export const Workflows = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [spaces, setSpaces] = useState<AssetSpace[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const spaceMap = useMemo(() => new Map(spaces.map((space) => [space.id, space])), [spaces]);

  const loadTemplates = async () => {
    const data = await workflowService.listWorkflowTemplates();
    setTemplates(data);
  };

  useEffect(() => {
    loadTemplates();
    loadSpaces();
  }, []);

  const loadSpaces = async () => {
    try {
      const data = await assetSpaceService.listAssetSpaces();
      setSpaces(data);
      setSelectedSpaceId((prev) => {
        if (prev && data.some((space) => space.id === prev)) {
          return prev;
        }
        return prev ?? null;
      });
    } catch {
      setSpaces([]);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('请输入模板名称');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await workflowService.createWorkflowTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        spaceId: selectedSpaceId ?? undefined,
      });
      setName('');
      setDescription('');
      await loadTemplates();
    } catch (err: any) {
      setError(err?.message || '创建模板失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (
    event: MouseEvent<HTMLButtonElement>,
    template: WorkflowTemplate,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`确定删除工作流模板「${template.name}」吗？该操作会删除所有版本与运行记录。`)) {
      return;
    }
    setDeletingId(template.id);
    try {
      await workflowService.deleteWorkflowTemplate(template.id);
      await loadTemplates();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Workflow 模板</h1>
          <p>管理低代码工作流模板与版本</p>
        </div>
        <div className={styles.form}>
          <input
            placeholder="模板名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            placeholder="描述（可选）"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <select
            value={selectedSpaceId ?? ''}
            onChange={(event) => setSelectedSpaceId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">不绑定资产空间</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
          <button className="btn btn--primary" onClick={handleCreate} disabled={loading}>
            {loading ? '创建中...' : '创建模板'}
          </button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </header>

      <section className={styles.grid}>
        {templates.map((template) => (
          <div
            key={template.id}
            className={styles.card}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/workflows/${template.id}`)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') navigate(`/workflows/${template.id}`);
            }}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>{template.name}</div>
              <button
                className="btn btn--outline btn--sm"
                onClick={(event) => handleDelete(event, template)}
                disabled={deletingId === template.id}
              >
                删除
              </button>
            </div>
            <div className={styles.cardDescription}>{template.description || '无描述'}</div>
            <div className={styles.cardMeta}>
              <span>ID #{template.id}</span>
              <span>空间: {template.spaceId ? spaceMap.get(template.spaceId)?.name || `#${template.spaceId}` : '未绑定'}</span>
              <span>更新: {new Date(template.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};
