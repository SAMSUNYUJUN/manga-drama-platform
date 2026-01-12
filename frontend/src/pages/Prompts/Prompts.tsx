/**
 * Prompts list page
 * @module pages/Prompts
 */

import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { promptService } from '../../services';
import type { PromptTemplate } from '@shared/types/prompt.types';
import styles from './Prompts.module.scss';

export const Prompts = () => {
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadPrompts = async () => {
    const data = await promptService.listPrompts();
    setPrompts(data);
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await promptService.createPrompt({ name, description, content });
    setName('');
    setDescription('');
    setContent('');
    await loadPrompts();
  };

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>, promptId: number, promptName: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`确定删除模板「${promptName}」吗？该操作会删除所有版本。`)) return;
    setDeletingId(promptId);
    try {
      await promptService.deletePrompt(promptId);
      await loadPrompts();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Prompt 模板</h1>
          <p>版本化管理提示词</p>
        </div>
        <div className={styles.form}>
          <input placeholder="名称" value={name} onChange={(event) => setName(event.target.value)} />
          <input
            placeholder="描述"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <input
            placeholder="初始内容（可选）"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <button className="btn btn--primary" onClick={handleCreate}>
            新建模板
          </button>
        </div>
      </header>

      <section className={styles.grid}>
        {prompts.map((prompt) => (
          <div
            key={prompt.id}
            className={styles.card}
            onClick={() => navigate(`/prompts/${prompt.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter') navigate(`/prompts/${prompt.id}`);
            }}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>{prompt.name}</div>
              <button
                className="btn btn--outline btn--sm"
                onClick={(event) => handleDelete(event, prompt.id, prompt.name)}
                disabled={deletingId === prompt.id}
              >
                删除
              </button>
            </div>
            <div className={styles.cardDescription}>{prompt.description || '无描述'}</div>
          </div>
        ))}
      </section>
    </div>
  );
};
