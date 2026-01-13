/**
 * Workflow template detail page
 * @module pages/WorkflowDetail
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { assetSpaceService, workflowService } from '../../services';
import type { WorkflowTemplate, WorkflowTemplateVersion } from '@shared/types/workflow.types';
import type { AssetSpace } from '@shared/types/asset-space.types';
import styles from './WorkflowDetail.module.scss';

export const WorkflowDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [versions, setVersions] = useState<WorkflowTemplateVersion[]>([]);
  const [spaces, setSpaces] = useState<AssetSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  const [savingSpace, setSavingSpace] = useState(false);
  const [spaceError, setSpaceError] = useState('');

  const loadData = async () => {
    if (!id) return;
    const templateId = Number(id);
    const tpl = await workflowService.getWorkflowTemplate(templateId);
    const list = await workflowService.listWorkflowTemplateVersions(templateId);
    setTemplate(tpl);
    setVersions(list);
    setSelectedSpaceId(tpl.spaceId ?? null);
  };

  useEffect(() => {
    loadData();
    loadSpaces();
  }, [id]);

  const loadSpaces = async () => {
    try {
      const data = await assetSpaceService.listAssetSpaces();
      setSpaces(data);
    } catch {
      setSpaces([]);
    }
  };

  const handleUpdateSpace = async () => {
    if (!template) return;
    setSavingSpace(true);
    setSpaceError('');
    try {
      const updated = await workflowService.updateWorkflowTemplate(template.id, {
        spaceId: selectedSpaceId ?? null,
      });
      setTemplate(updated);
    } catch (error: any) {
      setSpaceError(error?.message || '绑定空间失败');
    } finally {
      setSavingSpace(false);
    }
  };

  if (!template) {
    return <div className={styles.loading}>加载中...</div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{template.name}</h1>
          <p>{template.description || '暂无描述'}</p>
        </div>
        <Link to={`/workflows/${template.id}/editor`} className="btn btn--primary">
          打开编辑器
        </Link>
      </header>

      <section className={styles.binding}>
        <h2>资产空间绑定</h2>
        <div className={styles.bindingRow}>
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
          <button className="btn btn--secondary" onClick={handleUpdateSpace} disabled={savingSpace}>
            {savingSpace ? '保存中...' : '保存绑定'}
          </button>
        </div>
        {spaceError && <div className={styles.error}>{spaceError}</div>}
      </section>

      <section className={styles.versions}>
        <h2>版本列表</h2>
        <div className={styles.list}>
          {versions.map((version) => (
            <div key={version.id} className={styles.item}>
              <div>
                <div className={styles.versionTitle}>v{version.version}</div>
                <div className={styles.meta}>节点: {version.nodes?.length || 0}</div>
              </div>
              <div className={styles.actions}>
                <Link
                  to={`/workflows/${template.id}/editor?versionId=${version.id}`}
                  className="btn btn--secondary btn--sm"
                >
                  编辑此版本
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
