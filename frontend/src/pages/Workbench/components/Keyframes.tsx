/**
 * 第四步：分镜关键帧生成
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { ShotLanguageResult, CostumePhotoItem, KeyframeShotItem } from '@shared/types/workbench.types';
import * as workbenchService from '../../../services/workbench.service';
import styles from '../Workbench.module.scss';

interface KeyframesProps {
  spaceId: number;
  shotLanguageResult?: ShotLanguageResult;
  shotLanguagePath?: string;
  costumePhotos?: CostumePhotoItem[] | null;
  initialShots?: KeyframeShotItem[] | null;
  onBack: () => void;
  onNext: () => void;
  onProgress?: (shots: KeyframeShotItem[]) => void;
}

interface ShotItem extends KeyframeShotItem {}

const Keyframes: React.FC<KeyframesProps> = ({
  spaceId,
  shotLanguageResult,
  shotLanguagePath,
  costumePhotos,
  initialShots,
  onBack,
  onNext,
  onProgress,
}) => {
  const [shots, setShots] = useState<ShotItem[]>(initialShots || []);
  const [loading, setLoading] = useState(!shotLanguageResult && !initialShots);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ item: ShotItem; imageUrl: string } | null>(null);

  const parseShotResult = useCallback(async (): Promise<ShotItem[]> => {
    if (initialShots?.length) return initialShots;
    let source = shotLanguageResult;
    if (!source && shotLanguagePath) {
      const resp = await fetch(shotLanguagePath);
      source = await resp.json();
    }
    if (!source?.镜头列表) {
      throw new Error('未找到镜头列表');
    }

    const matchReference = (name: string, type: 'character' | 'scene' | 'prop'): string | null => {
      if (!costumePhotos?.length || !name) return null;
      const found = costumePhotos.find(
        (item) =>
          item.type === type &&
          item.savedImage &&
          item.name &&
          (item.name === name || item.name.includes(name) || name.includes(item.name)),
      );
      return found?.savedPath || found?.savedImage || null;
    };

    const mapped: ShotItem[] = source.镜头列表.map((shot, index) => {
      const references: string[] = [];
      shot.出现人物?.forEach((p: string) => {
        const ref = matchReference(p, 'character');
        if (ref) references.push(ref);
      });
      if (shot.出现场景) {
        const ref = matchReference(shot.出现场景, 'scene');
        if (ref) references.push(ref);
      }
      shot.道具名称?.forEach((p: string) => {
        const ref = matchReference(p, 'prop');
        if (ref) references.push(ref);
      });

      return {
        id: `shot_${index}`,
        shotNumber: shot.镜头编号,
        duration: shot.时长秒,
        frameInfo: shot,
        frameInfoText: JSON.stringify(shot, null, 2),
        references,
        images: [],
        failedImages: [],
        isGenerating: false,
      };
    });

    return mapped;
  }, [shotLanguageResult, shotLanguagePath, costumePhotos, initialShots]);

  // init
  useEffect(() => {
    if (shots.length) return;
    let cancelled = false;
    const init = async () => {
      try {
        setLoading(true);
        const items = await parseShotResult();
        if (!cancelled) setShots(items);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || '加载镜头失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [parseShotResult, shots.length]);

  // persist
  useEffect(() => {
    if (!onProgress) return;
    onProgress(shots);
  }, [shots, onProgress]);

  const frameInfoText = (shot: ShotItem) =>
    shot.frameInfoText || JSON.stringify(shot.frameInfo, null, 2);

  const addFailed = (shotId: string, idx: number) => {
    setShots((prev) =>
      prev.map((s) => {
        if (s.id !== shotId) return s;
        const failId = `fail-${Date.now()}-${idx}`;
        return { ...s, failedImages: [...s.failedImages, failId] };
      }),
    );
  };

  const handleGenerate = async (shotId: string) => {
    setShots((prev) =>
      prev.map((s) => (s.id === shotId ? { ...s, isGenerating: true, failedImages: [] } : s)),
    );
    const shot = shots.find((s) => s.id === shotId);
    if (!shot) return;
    if (!shot.references.length) {
      setError('请先选择参考图');
      setShots((prev) => prev.map((s) => (s.id === shotId ? { ...s, isGenerating: false } : s)));
      return;
    }

    try {
      const tasks = Array.from({ length: 3 }, (_, idx) =>
        workbenchService
          .runKeyframeShots(frameInfoText(shot), shot.references)
          .then((imgs) => {
            if (!imgs?.length) {
              addFailed(shotId, idx);
              return;
            }
            setShots((prev) =>
              prev.map((s) => {
                if (s.id !== shotId) return s;
                const merged = Array.from(new Set([...s.images, ...imgs]));
                return { ...s, images: merged };
              }),
            );
          })
          .catch(() => addFailed(shotId, idx)),
      );
      await Promise.all(tasks);
    } catch (err: any) {
      setError(err?.message || '生成失败');
    } finally {
      setShots((prev) =>
        prev.map((s) => (s.id === shotId ? { ...s, isGenerating: false } : s)),
      );
    }
  };

  const handleRegenerateSingle = async (shot: ShotItem, placeholderId: string) => {
    try {
      const imgs = await workbenchService.runKeyframeShots(frameInfoText(shot), shot.references);
      if (imgs?.length) {
        setShots((prev) =>
          prev.map((s) => {
            if (s.id !== shot.id) return s;
            const failedImages = s.failedImages.filter((f) => f !== placeholderId);
            return { ...s, images: [...s.images, imgs[0]], failedImages };
          }),
        );
      }
    } catch (err: any) {
      setError(err?.message || '重绘失败');
    }
  };

  const handleReferenceChange = (shotId: string, newRef: string, index?: number) => {
    setShots((prev) =>
      prev.map((s) => {
        if (s.id !== shotId) return s;
        const refs = [...s.references];
        if (index !== undefined && index < refs.length) {
          refs[index] = newRef;
        } else {
          refs.push(newRef);
        }
        return { ...s, references: refs };
      }),
    );
  };

  const buildFileName = (shot: ShotItem) => {
    const num = shot.shotNumber ?? 0;
    const dur = shot.duration ?? 0;
    return workbenchService.generateFileName(`镜头_${num}_时长_${dur}`, 'png');
  };

  const handleSave = async (shot: ShotItem, imageUrl: string) => {
    if (shot.savedImage && !window.confirm('该镜头已保存过分镜图，确定覆盖吗？')) return;
    setIsSaving(true);
    try {
      const fileName = buildFileName(shot);
      const path = await workbenchService.saveImageToSpace(spaceId, fileName, imageUrl);
      setShots((prev) =>
        prev.map((s) => (s.id === shot.id ? { ...s, savedImage: imageUrl, savedPath: path } : s)),
      );
    } catch (err: any) {
      setError(err?.message || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const shotReady = (shot: ShotItem) => shot.references.length > 0;
  const allSaved = shots.length > 0 && shots.every((s) => s.savedImage);

  if (loading) {
    return (
      <div className={styles.stepContainer}>
        <div className={styles.loading}>加载镜头列表...</div>
      </div>
    );
  }

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <h2>第四步：分镜关键帧生成</h2>
        <p className={styles.stepDescription}>
          为每个镜头生成关键帧图，使用定妆照作为参考
        </p>
      </div>

      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.shotList}>
        {shots.map((shot) => (
          <div key={shot.id} className={styles.shotCard}>
            <div className={styles.cardHeader}>
              <div>
                <h4>镜头 #{shot.shotNumber}</h4>
                <div className={styles.meta}>时长: {shot.duration}s</div>
              </div>
              {shot.savedImage && <span className={styles.savedBadge}>✓ 已保存</span>}
            </div>

            <div className={styles.frameInfo}>
              <div className={styles.refHeader}>
                <h5>Frame Info</h5>
              </div>
              <textarea
                value={frameInfoText(shot)}
                onChange={(e) => {
                  const text = e.target.value;
                  setShots((prev) =>
                    prev.map((s) => {
                      if (s.id !== shot.id) return s;
                      let parsed: any = s.frameInfo;
                      try {
                        parsed = JSON.parse(text);
                      } catch {
                        // keep old parsed if invalid JSON
                      }
                      return { ...s, frameInfo: parsed, frameInfoText: text };
                    }),
                  );
                }}
              />
            </div>

            <div className={styles.references}>
              <div className={styles.refHeader}>
                <h5>参考图 ({shot.references.length})</h5>
                <button
                  className={styles.addRefBtn}
                  onClick={() => {
                    const url = window.prompt('输入参考图 URL 或粘贴资产链接');
                    if (url) handleReferenceChange(shot.id, url);
                  }}
                >
                  + 添加参考图
                </button>
              </div>
              <div className={styles.refList}>
                {shot.references.map((ref, idx) => (
                  <div key={idx} className={styles.refItem}>
                    <img src={ref} alt={`ref-${idx}`} />
                    <button
                      className={styles.replaceBtn}
                      onClick={() => {
                        const url = window.prompt('输入新的参考图 URL', ref);
                        if (url) handleReferenceChange(shot.id, url, idx);
                      }}
                    >
                      更换
                    </button>
                  </div>
                ))}
                {!shot.references.length && <div className={styles.refPlaceholder}>未选择参考图</div>}
              </div>
            </div>

            <div className={styles.imageGrid}>
              {shot.images.length === 0 && shot.failedImages.length === 0 && shot.isGenerating ? (
                <div className={styles.generatingPlaceholder}>
                  <div className={styles.spinner} />
                  <span>生成中...</span>
                </div>
              ) : (
                <div className={styles.imageGridInner}>
                  {shot.images.map((img, idx) => (
                    <div
                      key={idx}
                      className={`${styles.thumbnail} ${shot.savedImage === img ? styles.selected : ''}`}
                      onClick={() => setSelectedImage({ item: shot, imageUrl: img })}
                    >
                      <img src={img} alt={`shot-${idx}`} />
                    </div>
                  ))}
                  {shot.failedImages.map((failId) => (
                    <div key={failId} className={`${styles.thumbnail} ${styles.failedThumb}`}>
                      <div className={styles.failedOverlay}>
                        <span>生成失败</span>
                        <button onClick={() => handleRegenerateSingle(shot, failId)}>重绘</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {shot.isGenerating && <div className={styles.generatingOverlay}>继续生成中...</div>}
            </div>

            <div className={styles.actionBar}>
              <button
                className={styles.generateBtn}
                onClick={() => handleGenerate(shot.id)}
                disabled={!shotReady(shot) || shot.isGenerating}
              >
                {shot.isGenerating ? '生成中...' : '开始生成'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedImage && (
        <div className={styles.previewOverlay} onClick={() => setSelectedImage(null)}>
          <div className={styles.previewContent} onClick={(e) => e.stopPropagation()}>
            <img src={selectedImage.imageUrl} alt={selectedImage.item.id} />
            <div className={styles.previewActions}>
              <button className={styles.closeBtn} onClick={() => setSelectedImage(null)}>缩小</button>
              <button className={styles.saveBtn} onClick={() => handleSave(selectedImage.item, selectedImage.imageUrl)} disabled={isSaving}>
                {isSaving ? '保存中...' : '保存'}
              </button>
              <button className={styles.regenerateBtn} onClick={() => handleRegenerateSingle(selectedImage.item, selectedImage.imageUrl)}>
                重绘
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.actionBar}>
        <button className={styles.backBtn} onClick={onBack}>
          ← 上一步
        </button>
        <div className={styles.progress}>已保存: {shots.filter((s) => s.savedImage).length} / {shots.length}</div>
        <button
          className={styles.completeBtn}
          disabled={!allSaved}
          onClick={() => {
            if (!allSaved) return;
            onNext();
          }}
        >
          {allSaved ? '进入关键帧转视频' : '请完成所有镜头保存'}
        </button>
      </div>
    </div>
  );
};

export default Keyframes;
