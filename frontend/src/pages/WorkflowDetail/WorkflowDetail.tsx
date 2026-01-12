/**
 * Workflow template detail page
 * @module pages/WorkflowDetail
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { workflowService } from '../../services';
import type { WorkflowTemplate, WorkflowTemplateVersion } from '@shared/types/workflow.types';
import styles from './WorkflowDetail.module.scss';

export const WorkflowDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [versions, setVersions] = useState<WorkflowTemplateVersion[]>([]);

  const loadData = async () => {
    if (!id) return;
    const templateId = Number(id);
    const tpl = await workflowService.getWorkflowTemplate(templateId);
    const list = await workflowService.listWorkflowTemplateVersions(templateId);
    setTemplate(tpl);
    setVersions(list);
  };

  useEffect(() => {
    loadData();
  }, [id]);

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
