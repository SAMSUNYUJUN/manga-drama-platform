/**
 * Workflow templates page
 * @module pages/Workflows
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workflowService } from '../../services';
import type { WorkflowTemplate } from '@shared/types/workflow.types';
import styles from './Workflows.module.scss';

export const Workflows = () => {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadTemplates = async () => {
    const data = await workflowService.listWorkflowTemplates();
    setTemplates(data);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

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
          <button className="btn btn--primary" onClick={handleCreate} disabled={loading}>
            {loading ? '创建中...' : '创建模板'}
          </button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </header>

      <section className={styles.grid}>
        {templates.map((template) => (
          <Link to={`/workflows/${template.id}`} key={template.id} className={styles.card}>
            <div className={styles.cardTitle}>{template.name}</div>
            <div className={styles.cardDescription}>{template.description || '无描述'}</div>
            <div className={styles.cardMeta}>
              <span>ID #{template.id}</span>
              <span>更新: {new Date(template.updatedAt).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
};
