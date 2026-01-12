/**
 * Admin config page
 * @module pages/AdminConfig
 */

import { useEffect, useState } from 'react';
import { adminService } from '../../services';
import type { GlobalConfig } from '@shared/types/provider.types';
import styles from './AdminConfig.module.scss';

export const AdminConfig = () => {
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [form, setForm] = useState({
    defaultLlmModel: '',
    defaultImageModel: '',
    defaultVideoModel: '',
    defaultLlmProviderId: '',
    defaultImageProviderId: '',
    defaultVideoProviderId: '',
  });

  const loadConfig = async () => {
    const data = await adminService.getGlobalConfig();
    setConfig(data);
    setForm({
      defaultLlmModel: data.defaultLlmModel || '',
      defaultImageModel: data.defaultImageModel || '',
      defaultVideoModel: data.defaultVideoModel || '',
      defaultLlmProviderId: data.defaultLlmProviderId ? String(data.defaultLlmProviderId) : '',
      defaultImageProviderId: data.defaultImageProviderId ? String(data.defaultImageProviderId) : '',
      defaultVideoProviderId: data.defaultVideoProviderId ? String(data.defaultVideoProviderId) : '',
    });
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async () => {
    await adminService.updateGlobalConfig({
      defaultLlmModel: form.defaultLlmModel,
      defaultImageModel: form.defaultImageModel,
      defaultVideoModel: form.defaultVideoModel,
      defaultLlmProviderId: form.defaultLlmProviderId ? Number(form.defaultLlmProviderId) : undefined,
      defaultImageProviderId: form.defaultImageProviderId ? Number(form.defaultImageProviderId) : undefined,
      defaultVideoProviderId: form.defaultVideoProviderId ? Number(form.defaultVideoProviderId) : undefined,
    });
    await loadConfig();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>全局配置</h1>
        <p>默认模型与Provider策略</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.form}>
          <label>默认 LLM Provider ID</label>
          <input
            value={form.defaultLlmProviderId}
            onChange={(event) => setForm({ ...form, defaultLlmProviderId: event.target.value })}
          />
          <label>默认 Image Provider ID</label>
          <input
            value={form.defaultImageProviderId}
            onChange={(event) => setForm({ ...form, defaultImageProviderId: event.target.value })}
          />
          <label>默认 Video Provider ID</label>
          <input
            value={form.defaultVideoProviderId}
            onChange={(event) => setForm({ ...form, defaultVideoProviderId: event.target.value })}
          />
          <label>默认 LLM 模型</label>
          <input
            value={form.defaultLlmModel}
            onChange={(event) => setForm({ ...form, defaultLlmModel: event.target.value })}
          />
          <label>默认 Image 模型</label>
          <input
            value={form.defaultImageModel}
            onChange={(event) => setForm({ ...form, defaultImageModel: event.target.value })}
          />
          <label>默认 Video 模型</label>
          <input
            value={form.defaultVideoModel}
            onChange={(event) => setForm({ ...form, defaultVideoModel: event.target.value })}
          />
        </div>
        <button className="btn btn--primary btn--sm" onClick={handleSave}>
          保存配置
        </button>
        {config && <div className={styles.meta}>配置更新时间: {new Date(config.updatedAt).toLocaleString()}</div>}
      </section>
    </div>
  );
};
