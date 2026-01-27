/**
 * 模型管理页面
 * @module pages/AdminProviders
 */

import { useEffect, useState } from 'react';
import { adminService } from '../../services';
import type { ProviderConfig } from '@shared/types/provider.types';
import { ProviderType } from '@shared/constants';
import styles from './AdminProviders.module.scss';

interface EditFormState {
  id: number;
  model: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
}

export const AdminProviders = () => {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [form, setForm] = useState({
    name: '',
    type: ProviderType.LLM as ProviderType,
    baseUrl: '',
    apiKey: '',
    model: '',
  });
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const loadProviders = async () => {
    const data = await adminService.listProviders();
    setProviders(data);
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const handleCreate = async () => {
    if (!form.model.trim()) {
      setError('请输入模型名称');
      return;
    }
    if (!form.baseUrl.trim()) {
      setError('请输入 Base URL');
      return;
    }
    if (!form.apiKey.trim()) {
      setError('请输入 API Key');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      // 使用模型名称作为 provider 名称
      await adminService.createProvider({
        name: form.model.trim(),
        type: form.type,
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
        models: [form.model.trim()],
      });
      setForm({ name: '', type: ProviderType.LLM, baseUrl: '', apiKey: '', model: '' });
      await loadProviders();
    } catch (err: any) {
      setError(err?.message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  const toggleProvider = async (provider: ProviderConfig) => {
    try {
      if (provider.enabled) {
        await adminService.disableProvider(provider.id);
      } else {
        await adminService.enableProvider(provider.id);
      }
      await loadProviders();
    } catch (err: any) {
      setError(err?.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await adminService.deleteProvider(id);
      setDeleteConfirm(null);
      await loadProviders();
    } catch (err: any) {
      setError(err?.message || '删除失败');
    }
  };

  const startEdit = (provider: ProviderConfig) => {
    setEditForm({
      id: provider.id,
      model: provider.models[0] || provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: '', // 不显示原有的 API Key
    });
  };

  const cancelEdit = () => {
    setEditForm(null);
  };

  const handleUpdate = async () => {
    if (!editForm) return;
    
    if (!editForm.baseUrl.trim()) {
      setError('请输入 Base URL');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      const updatePayload: any = {
        name: editForm.model.trim(),
        type: editForm.type,
        baseUrl: editForm.baseUrl.trim(),
        models: [editForm.model.trim()],
      };
      // 只有填写了新的 API Key 才更新
      if (editForm.apiKey.trim()) {
        updatePayload.apiKey = editForm.apiKey.trim();
      }
      await adminService.updateProvider(editForm.id, updatePayload);
      setEditForm(null);
      await loadProviders();
    } catch (err: any) {
      setError(err?.message || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type: ProviderType) => {
    switch (type) {
      case ProviderType.LLM:
        return '🤖 LLM';
      case ProviderType.IMAGE:
        return '🎨 Image';
      case ProviderType.VIDEO:
        return '🎬 Video';
      default:
        return type;
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>🤖 模型管理</h1>
        <p>注册和管理 AI 模型（DeepSeek、图像/视频生成等）</p>
      </header>

      <section className={styles.panel}>
        <h3>添加新模型</h3>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.form}>
          <div className={styles.formRow}>
            <label>模型名称</label>
            <input
              placeholder="例如: deepseek-chat, gpt-4o-mini"
              value={form.model}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
            />
          </div>
          <div className={styles.formRow}>
            <label>模型类型</label>
            <select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value as ProviderType })}
            >
              <option value={ProviderType.LLM}>🤖 LLM (文本生成，如 DeepSeek)</option>
              <option value={ProviderType.IMAGE}>🎨 Image (图像生成，如 Doubao-Seedream)</option>
              <option value={ProviderType.VIDEO}>🎬 Video (视频生成，如 Sora 系列)</option>
            </select>
          </div>
          <div className={styles.formRow}>
            <label>Base URL</label>
            <input
              placeholder="例如: https://api.deepseek.com/v1"
              value={form.baseUrl}
              onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
            />
          </div>
          <div className={styles.formRow}>
            <label>API Key</label>
            <input
              type="password"
              placeholder="输入 API Key"
              value={form.apiKey}
              onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
            />
          </div>
          <button 
            className="btn btn--primary" 
            onClick={handleCreate} 
            disabled={loading}
          >
            {loading ? '添加中...' : '添加模型'}
          </button>
        </div>
      </section>

      <section className={styles.panel}>
        <h3>已注册模型</h3>
        {providers.length === 0 ? (
          <div className={styles.empty}>暂无已注册模型，请先添加模型配置</div>
        ) : (
          <div className={styles.list}>
            {providers.map((provider) => (
              <div key={provider.id} className={`${styles.item} ${!provider.enabled ? styles.disabled : ''}`}>
                <div className={styles.itemInfo}>
                  <div className={styles.title}>
                    {provider.models[0] || provider.name}
                    {!provider.enabled && <span className={styles.tag}>已禁用</span>}
                  </div>
                  <div className={styles.meta}>
                    <span className={styles.type}>{getTypeLabel(provider.type)}</span>
                    <span className={styles.url}>{provider.baseUrl}</span>
                    <span className={styles.key}>API Key: {provider.apiKeyMasked || '****'}</span>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button 
                    className="btn btn--sm btn--ghost"
                    onClick={() => startEdit(provider)}
                    title="编辑"
                  >
                    ✏️
                  </button>
                  <button 
                    className={`btn btn--sm ${provider.enabled ? 'btn--outline' : 'btn--secondary'}`}
                    onClick={() => toggleProvider(provider)}
                  >
                    {provider.enabled ? '禁用' : '启用'}
                  </button>
                  {deleteConfirm === provider.id ? (
                    <>
                      <button 
                        className="btn btn--sm btn--danger"
                        onClick={() => handleDelete(provider.id)}
                      >
                        确认删除
                      </button>
                      <button 
                        className="btn btn--sm btn--ghost"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button 
                      className="btn btn--sm btn--ghost"
                      onClick={() => setDeleteConfirm(provider.id)}
                      title="删除"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 编辑模态框 */}
      {editForm && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>编辑模型</h3>
            <div className={styles.form}>
              <div className={styles.formRow}>
                <label>模型名称</label>
                <input
                  value={editForm.model}
                  onChange={(event) => setEditForm({ ...editForm, model: event.target.value })}
                />
              </div>
              <div className={styles.formRow}>
                <label>模型类型</label>
                <select
                  value={editForm.type}
                  onChange={(event) => setEditForm({ ...editForm, type: event.target.value as ProviderType })}
                >
                  <option value={ProviderType.LLM}>🤖 LLM (文本生成)</option>
                  <option value={ProviderType.IMAGE}>🎨 Image (图像生成)</option>
                  <option value={ProviderType.VIDEO}>🎬 Video (视频生成)</option>
                </select>
              </div>
              <div className={styles.formRow}>
                <label>Base URL</label>
                <input
                  value={editForm.baseUrl}
                  onChange={(event) => setEditForm({ ...editForm, baseUrl: event.target.value })}
                />
              </div>
              <div className={styles.formRow}>
                <label>API Key（留空则不修改）</label>
                <input
                  type="password"
                  placeholder="输入新的 API Key，或留空保持不变"
                  value={editForm.apiKey}
                  onChange={(event) => setEditForm({ ...editForm, apiKey: event.target.value })}
                />
              </div>
              <div className={styles.modalActions}>
                <button 
                  className="btn btn--primary" 
                  onClick={handleUpdate} 
                  disabled={loading}
                >
                  {loading ? '保存中...' : '保存'}
                </button>
                <button 
                  className="btn btn--ghost" 
                  onClick={cancelEdit}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className={styles.panel}>
        <h3>💡 使用说明</h3>
        <div className={styles.help}>
          <p><strong>LLM 模型</strong>（如 DeepSeek）：用于文本生成任务，支持 OpenAI 兼容的 API 格式</p>
          <p><strong>Image 模型</strong>（如 Doubao-Seedream）：用于图像生成任务，支持 text-to-image 和 image-to-image</p>
          <p><strong>Video 模型</strong>（如 Sora / VEO）：用于视频生成任务，支持 text-to-video 和 image-to-video</p>
          <hr />
          <p><strong>常用配置示例：</strong></p>
          <ul>
            <li>DeepSeek: Base URL = <code>https://api.deepseek.com/v1</code></li>
            <li>Doubao-Seedream: Base URL = <code>https://ark.cn-beijing.volces.com/api/v3</code></li>
            <li>Sora / VEO: Base URL 例如 <code>https://api.laozhang.ai/v1/videos</code></li>
          </ul>
        </div>
      </section>
    </div>
  );
};
