/**
 * Prompt detail page
 * @module pages/PromptDetail
 */

import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import { promptService } from '../../services';
import type { PromptTemplate, PromptTemplateVersion } from '@shared/types/prompt.types';
import styles from './PromptDetail.module.scss';

export const PromptDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<PromptTemplate | null>(null);
  const [versions, setVersions] = useState<PromptTemplateVersion[]>([]);
  const [content, setContent] = useState('');
  const [versionName, setVersionName] = useState('');
  const [versionError, setVersionError] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [rendered, setRendered] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) || versions[0],
    [versions, selectedVersionId],
  );

  const loadData = async () => {
    if (!id) return;
    const templateId = Number(id);
    const tpl = await promptService.getPrompt(templateId);
    const list = await promptService.listPromptVersions(templateId);
    setTemplate(tpl);
    setVersions(list);
    setSelectedVersionId((prev) => {
      if (prev && list.some((item) => item.id === prev)) return prev;
      return list[0]?.id || null;
    });
  };

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    if (!selectedVersion) return;
    const defaults: Record<string, string> = {};
    (selectedVersion.variables || []).forEach((key) => {
      defaults[key] = variables[key] || '';
    });
    setVariables(defaults);
  }, [selectedVersion?.id]);

  const handleCreateVersion = async () => {
    if (!template || !content.trim()) return;
    if (!versionName.trim()) {
      setVersionError('请输入版本名称');
      return;
    }
    setVersionError('');
    await promptService.createPromptVersion(template.id, {
      content,
      name: versionName.trim(),
    });
    setContent('');
    setVersionName('');
    await loadData();
  };

  const handleDeleteVersion = async (
    event: MouseEvent<HTMLButtonElement>,
    version: PromptTemplateVersion,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!template) return;
    const label = version.name || '未命名版本';
    if (!window.confirm(`确定删除 ${label} 吗？`)) return;
    setDeletingId(version.id);
    try {
      await promptService.deletePromptVersion(template.id, version.id);
      setRendered('');
      await loadData();
    } finally {
      setDeletingId(null);
    }
  };

  const handleRenameVersion = async (
    event: MouseEvent<HTMLButtonElement>,
    version: PromptTemplateVersion,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!template) return;
    const nextName = window.prompt('输入版本名称', version.name || '');
    if (nextName === null) return;
    if (!nextName.trim()) {
      window.alert('版本名称不能为空');
      return;
    }
    setRenamingId(version.id);
    try {
      await promptService.updatePromptVersion(template.id, version.id, {
        name: nextName.trim(),
      });
      await loadData();
    } finally {
      setRenamingId(null);
    }
  };

  const handleRender = async () => {
    if (!selectedVersion) return;
    const result = await promptService.renderPrompt(selectedVersion.id, variables);
    setRendered(result.rendered);
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
      </header>

      <section className={styles.panel}>
        <h3>新版本内容</h3>
        <input
          placeholder="版本名称"
          value={versionName}
          onChange={(event) => setVersionName(event.target.value)}
        />
        <textarea
          rows={4}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <button className="btn btn--primary btn--sm" onClick={handleCreateVersion}>
          新建版本
        </button>
        {versionError && <div className={styles.error}>{versionError}</div>}
      </section>

      <section className={styles.panel}>
        <h3>版本列表</h3>
        <div className={styles.versionList}>
          {versions.map((version) => (
            <div key={version.id} className={styles.versionRow}>
              <button
                className={`${styles.versionItem} ${
                  selectedVersionId === version.id ? styles.active : ''
                }`}
                onClick={() => setSelectedVersionId(version.id)}
              >
                {version.name || '未命名版本'}
              </button>
              <button
                className="btn btn--outline btn--sm"
                onClick={(event) => handleRenameVersion(event, version)}
                disabled={renamingId === version.id}
              >
                改名
              </button>
              <button
                className="btn btn--outline btn--sm"
                onClick={(event) => handleDeleteVersion(event, version)}
                disabled={deletingId === version.id}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </section>

      {selectedVersion && (
        <section className={styles.panel}>
          <h3>变量预览</h3>
          <div className={styles.variables}>
            {(selectedVersion.variables || []).map((key) => (
              <div key={key} className={styles.variableItem}>
                <label>{key}</label>
                <input
                  value={variables[key] || ''}
                  onChange={(event) => setVariables({ ...variables, [key]: event.target.value })}
                />
              </div>
            ))}
          </div>
          <button className="btn btn--secondary btn--sm" onClick={handleRender}>
            渲染预览
          </button>
          {rendered && <pre className={styles.rendered}>{rendered}</pre>}
        </section>
      )}
    </div>
  );
};
