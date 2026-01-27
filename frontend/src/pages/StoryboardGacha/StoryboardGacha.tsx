import { useEffect, useMemo, useState } from 'react';
import styles from './StoryboardGacha.module.scss';
import { listShots, createShot, deleteShot, listMessages, generateMedia, deleteMessage, saveMessageAssets } from '../../services/storyboard.service';
import type { Shot, Message } from '../../services/storyboard.service';
import { assetSpaceService } from '../../services';
import type { AssetSpace } from '@shared/types/asset-space.types';

const MODEL_OPTIONS = [
  { value: 'nano-banana-pro', label: 'nano banana Pro（图片）', kind: 'image' as const },
  { value: 'jimeng-4.5', label: '极梦4.5（图片）', kind: 'image' as const },
  { value: 'veo3.1', label: 'veo3.1（视频）', kind: 'video' as const },
  { value: 'sora-2-pro', label: 'sora 2 Pro（视频）', kind: 'video' as const },
];

const MAX_MESSAGES_PER_SHOT = 5;

export const StoryboardGacha = () => {
  const [shots, setShots] = useState<Shot[]>([]);
  const [spaces, setSpaces] = useState<AssetSpace[]>([]);
  const [creating, setCreating] = useState(false);
  const [selectedShotId, setSelectedShotId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string>('');
  const [pendingShotId, setPendingShotId] = useState<number | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string>('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [saveSpaceId, setSaveSpaceId] = useState<number | ''>('');

  const selectedShot = useMemo(() => shots.find((s) => s.id === selectedShotId) || null, [shots, selectedShotId]);
  const modelKind = useMemo(() => MODEL_OPTIONS.find((m) => m.value === model)?.kind || 'image', [model]);

  useEffect(() => {
    loadShots();
    loadSpaces();
  }, []);

  useEffect(() => {
    if (selectedShotId) loadMessages(selectedShotId);
  }, [selectedShotId]);

  // 切换分镜时清空输入与 pending 状态，避免携带上一分镜的 prompt/图片
  useEffect(() => {
    setPrompt('');
    setUploadFiles([]);
    setImageUrls('');
    setPendingShotId(null);
    setPendingPrompt('');
    setFileInputKey((k) => k + 1); // reset file input
  }, [selectedShotId]);

  const loadShots = async () => {
    const data = await listShots();
    setShots(data);
    if (!selectedShotId && data.length) setSelectedShotId(data[0].id);
  };

  const loadSpaces = async () => {
    try {
      const res = await assetSpaceService.listAssetSpaces();
      setSpaces(res);
      if (!saveSpaceId && res.length) setSaveSpaceId(res[0].id);
    } catch (error) {
      console.error('load spaces failed', error);
    }
  };

  const loadMessages = async (shotId: number) => {
    const data = await listMessages(shotId);
    setMessages(data);
  };

  const handleCreateShot = async () => {
    if (!spaces.length) return;
    setCreating(true);
    try {
      const spaceId = spaces[0].id;
      const shot = await createShot({ title: `分镜${shots.length + 1}`, spaceId });
      await loadShots();
      setSelectedShotId(shot.id);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteShot = async (id: number) => {
    await deleteShot(id);
    setShots((prev) => prev.filter((s) => s.id !== id));
    if (selectedShotId === id) setSelectedShotId(null);
  };

  const canUploadMultiple = modelKind === 'image';
  const maxFiles = modelKind === 'image' ? 5 : 1;

  const handleFiles = (files?: FileList | null) => {
    const arr = files ? Array.from(files).slice(0, maxFiles) : [];
    setUploadFiles(arr);
  };

  const handleGenerate = async () => {
    if (!selectedShot) return;
    if (!prompt.trim()) return;
    if (pendingShotId === selectedShot.id) return;
    if (messages.length >= MAX_MESSAGES_PER_SHOT) {
      alert('该分镜已达 5 次上限，请新建分镜');
      return;
    }
    setPendingShotId(selectedShot.id);
    setPendingPrompt(prompt.trim());
    try {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt.trim());
      if (imageUrls.trim()) form.append('imageUrls', imageUrls.trim());
      uploadFiles.forEach((file, idx) => {
        if (modelKind === 'video') {
          if (idx === 0) form.append('input_reference', file);
        } else {
          form.append(`image${idx + 1}`, file);
        }
      });
      const res = await generateMedia(selectedShot.id, form);
      setPrompt('');
      setUploadFiles([]);
      setImageUrls('');
      setFileInputKey((k) => k + 1); // reset file input after submit
      await loadMessages(selectedShot.id);
      await loadShots();
    } catch (error: any) {
      alert(error?.response?.data?.message || error?.message || '生成失败');
    } finally {
      setPendingShotId((prev) => (prev === selectedShot.id ? null : prev));
      setPendingPrompt('');
    }
  };

  const renderMedia = (msg: Message) => {
    const urls: string[] = msg.mediaUrlsJson ? JSON.parse(msg.mediaUrlsJson) : [];
    const kind = msg.model.includes('veo') || msg.model.includes('sora') ? 'video' : 'image';
    return (
      <div className={styles.mediaList}>
        {urls.map((url) =>
          kind === 'video' ? (
            <video key={url} controls src={url} />
          ) : (
            <a key={url} href={url} download target="_blank" rel="noreferrer">
              <img src={url} alt="result" />
            </a>
          ),
        )}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h3>分镜列表</h3>
          <button className="btn btn--secondary btn--sm" disabled={creating} onClick={handleCreateShot}>
            新建分镜
          </button>
        </div>
        <div className={styles.shotList}>
          {shots.map((shot) => (
            <div
              key={shot.id}
              className={`${styles.shotItem} ${shot.id === selectedShotId ? styles.active : ''}`}
              onClick={() => setSelectedShotId(shot.id)}
            >
              <div>
                <div className={styles.shotTitle}>{shot.title}</div>
                <div className={styles.shotMeta}>生成 {shot.messageCount}/5</div>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); handleDeleteShot(shot.id); }}>
                删除
              </button>
            </div>
          ))}
          {!shots.length && <div className={styles.empty}>暂无分镜，先新建一个吧</div>}
        </div>
      </aside>

      <section className={styles.chatPane}>
        {selectedShot ? (
          <>
            <div className={styles.modelRow}>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className={styles.hint}>视频模型仅支持 1 张参考图；图片模型最多 5 张。</div>
              <div className={styles.saveSpace}>
                <span>保存空间</span>
                <select
                  value={saveSpaceId}
                  onChange={(e) => setSaveSpaceId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">不保存</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.messages}>
              {messages.map((msg) => (
                <div key={msg.id} className={styles.messageItem}>
                  <div className={styles.prompt}>{msg.prompt}</div>
                  {renderMedia(msg)}
                  <div className={styles.meta}>
                    {msg.model} · {msg.status} · {msg.durationMs ? `${msg.durationMs}ms` : ''}
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={async () => {
                        await deleteMessage(msg.id);
                        if (selectedShotId) await loadMessages(selectedShotId);
                      }}
                      style={{ marginLeft: 8 }}
                    >
                      删除
                    </button>
                    {!!saveSpaceId && msg.status === 'completed' && (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={async () => {
                          await saveMessageAssets(msg.id, Number(saveSpaceId));
                          alert('已保存到资产空间');
                        }}
                      >
                        保存到空间
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {pendingShotId === selectedShot.id && (
                <div className={`${styles.messageItem} ${styles.pending}`}>
                  <div className={styles.prompt}>{pendingPrompt || '等待生成...'}</div>
                  <div className={styles.meta}>生成中...</div>
                </div>
              )}
              {!messages.length && <div className={styles.empty}>还没有生成记录</div>}
            </div>
            <div className={styles.inputCard}>
              <textarea
                rows={3}
                placeholder="输入提示词..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <div className={styles.uploadRow}>
                <input
                  key={fileInputKey}
                  type="file"
                  accept="image/*"
                  multiple={canUploadMultiple}
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <input
                  type="text"
                  placeholder="图片 URL，逗号分隔（可选）"
                  value={imageUrls}
                  onChange={(e) => setImageUrls(e.target.value)}
                />
              </div>
              <div className={styles.actions}>
                <div className={styles.counter}>已生成 {messages.length}/{MAX_MESSAGES_PER_SHOT}</div>
                <button className="btn btn--primary" disabled={pendingShotId === selectedShot?.id} onClick={handleGenerate}>
                  {pendingShotId === selectedShot?.id ? '生成中...' : '生成'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.placeholder}>请选择左侧分镜或新建一个</div>
        )}
      </section>
    </div>
  );
};

export default StoryboardGacha;
