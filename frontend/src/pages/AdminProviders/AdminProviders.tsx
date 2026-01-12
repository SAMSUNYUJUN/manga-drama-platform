/**
 * Admin providers page
 * @module pages/AdminProviders
 */

import { useEffect, useState } from 'react';
import { adminService } from '../../services';
import type { ProviderConfig } from '@shared/types/provider.types';
import { ProviderType } from '@shared/constants';
import styles from './AdminProviders.module.scss';

export const AdminProviders = () => {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [form, setForm] = useState({
    name: '',
    type: ProviderType.LLM,
    baseUrl: '',
    apiKey: '',
    models: '',
  });

  const loadProviders = async () => {
    const data = await adminService.listProviders();
    setProviders(data);
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.baseUrl.trim()) return;
    await adminService.createProvider({
      name: form.name,
      type: form.type,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      models: form.models.split(',').map((model) => model.trim()).filter(Boolean),
    });
    setForm({ name: '', type: ProviderType.LLM, baseUrl: '', apiKey: '', models: '' });
    await loadProviders();
  };

  const toggleProvider = async (provider: ProviderConfig) => {
    if (provider.enabled) {
      await adminService.disableProvider(provider.id);
    } else {
      await adminService.enableProvider(provider.id);
    }
    await loadProviders();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Provider 管理</h1>
        <p>统一管理 AI Provider 与模型</p>
      </header>

      <section className={styles.panel}>
        <h3>新增 Provider</h3>
        <div className={styles.form}>
          <input
            placeholder="名称"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <select
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value as ProviderType })}
          >
            <option value={ProviderType.LLM}>LLM</option>
            <option value={ProviderType.IMAGE}>IMAGE</option>
            <option value={ProviderType.VIDEO}>VIDEO</option>
          </select>
          <input
            placeholder="Base URL"
            value={form.baseUrl}
            onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
          />
          <input
            placeholder="API Key"
            value={form.apiKey}
            onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
          />
          <input
            placeholder="模型列表 (逗号分隔)"
            value={form.models}
            onChange={(event) => setForm({ ...form, models: event.target.value })}
          />
          <button className="btn btn--primary btn--sm" onClick={handleCreate}>
            创建
          </button>
        </div>
      </section>

      <section className={styles.list}>
        {providers.map((provider) => (
          <div key={provider.id} className={styles.item}>
            <div>
              <div className={styles.title}>{provider.name}</div>
              <div className={styles.meta}>
                {provider.type} · {provider.baseUrl} · {provider.apiKeyMasked || '****'} · {provider.models.join(', ')}
              </div>
            </div>
            <button className="btn btn--secondary btn--sm" onClick={() => toggleProvider(provider)}>
              {provider.enabled ? '禁用' : '启用'}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
};
