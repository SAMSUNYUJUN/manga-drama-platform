/**
 * 第五步：关键帧转视频
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { ShotLanguageResult, ShotVideoItem } from '@shared/types/workbench.types';
import type { Asset } from '@shared/types/asset.types';
import { assetService } from '../../../services';
import * as workbenchService from '../../../services/workbench.service';
import { AssetStatus } from '@shared/constants';
import styles from '../Workbench.module.scss';

interface KeyframeVideoProps {
  spaceId: number;
  shotLanguageResult?: ShotLanguageResult;
  shotLanguagePath?: string | null;
  initialShots?: ShotVideoItem[] | null;
  initialSeconds?: 10 | 15;
  onBack: () => void;
  onProgress?: (items: ShotVideoItem[]) => void;
  onSecondsChange?: (value: 10 | 15) => void;
}

type ShotEntry = {
  镜头编号: number;
  时长秒: number;
  视频Prompt: string;
  镜头内容概述?: string;
  出现人物?: string[];
  出现场景?: string;
  道具名称?: string[];
};

const SHOT_FILE_PREFIX = '镜头';

const parseJsonSafe = async (url: string): Promise<ShotLanguageResult | undefined> => {
  try {
    const resp = await fetch(url);
    const json = await resp.json();
    return json as ShotLanguageResult;
  } catch {
    return undefined;
  }
};

const KeyframeVideo: React.FC<KeyframeVideoProps> = ({
  spaceId,
  shotLanguageResult,
  shotLanguagePath,
  initialShots,
  initialSeconds,
  onBack,
  onProgress,
  onSecondsChange,
}) => {
  const [shots, setShots] = useState<ShotVideoItem[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedShotIndex, setSelectedShotIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<10 | 15>(10);
  const [hydrated, setHydrated] = useState(false);
  const progressTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const selectedShot = shots[selectedShotIndex];

  const imageAssets = useMemo(
    () => assets.filter((asset) => (asset.mimeType || '').startsWith('image/')),
    [assets],
  );

  const loadShots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let source: ShotLanguageResult | undefined | null = shotLanguageResult;
      if (!source && shotLanguagePath) {
        source = await parseJsonSafe(shotLanguagePath);
      }
      if (!source?.镜头列表?.length) {
        throw new Error('未找到镜头列表，请先完成镜头语言转译');
      }
      const mapped: ShotVideoItem[] = source.镜头列表.map((item: ShotEntry) => ({
        shotNumber: item.镜头编号,
        duration: item.时长秒,
        frameInfoText: JSON.stringify(item, null, 2),
        selectedImage: '',
        seconds: 10,
        isGenerating: false,
      }));
      setShots(mapped);
      if (mapped.length) {
        const sec = (initialSeconds || mapped[0].seconds || 10) as 10 | 15;
        setSeconds(sec);
        onSecondsChange?.(sec);
      }
      if (mapped.length) {
        onProgress?.(mapped);
      }
    } catch (err: any) {
      setError(err?.message || '加载镜头列表失败');
    } finally {
      setLoading(false);
    }
  }, [shotLanguageResult, shotLanguagePath, initialSeconds, onProgress, onSecondsChange]);

  const loadAssets = useCallback(async () => {
    setError(null);
    const pageSize = 100;
    let page = 1;
    let combined: Asset[] = [];
    try {
      while (true) {
        const data = await assetService.listAssets({
          spaceId,
          status: AssetStatus.ACTIVE,
          page,
          limit: pageSize,
        });
        combined = combined.concat(data.items || []);
        if (page >= (data.totalPages || 1)) break;
        page += 1;
      }
      setAssets(combined);
    } catch (err: any) {
      setError(err?.message || '加载资产失败');
      setAssets([]);
    }
  }, [spaceId]);

  useEffect(() => {
    if (hydrated) return;
    if (initialShots?.length) {
      const normalized = initialShots.map((s) => {
        const isFinished = s.status === 'completed' || s.status === 'failed';
        const progressVal =
          s.progress !== undefined
            ? s.progress
            : s.status === 'completed'
            ? 100
            : s.status === 'failed'
            ? 0
            : s.isGenerating
            ? 5
            : 0;
        return {
          ...s,
          isGenerating: isFinished ? false : !!s.isGenerating,
          progress: progressVal,
        };
      });
      const sec = (normalized[0]?.seconds || initialSeconds || 10) as 10 | 15;
      setShots(normalized);
      setSeconds(sec);
      onSecondsChange?.(sec);
      onProgress?.(normalized);
      setLoading(false);
      setHydrated(true);
      return;
    }
    loadShots().finally(() => setHydrated(true));
  }, [hydrated, initialShots, initialSeconds, loadShots, onProgress, onSecondsChange]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    if (selectedShotIndex >= shots.length && shots.length > 0) {
      setSelectedShotIndex(0);
    }
  }, [selectedShotIndex, shots.length]);

  useEffect(() => {
    // Resume polling for pending jobs after navigation/hydration
    shots.forEach((shot, index) => {
      const inProgress =
        shot.jobId &&
        !progressTimers.current.get(shot.jobId) &&
        shot.status !== 'completed' &&
        shot.status !== 'failed' &&
        shot.isGenerating !== false;
      if (inProgress) {
        startProgressPoll(shot.jobId as string, index);
      }
    });
  }, [shots]);

  useEffect(() => {
    return () => {
      progressTimers.current.forEach((timer) => clearInterval(timer));
      progressTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!shots.length || !assets.length) return;
    const withMatches = shots.map((shot) => {
      if (shot.selectedImage) return shot;
      const regex = new RegExp(`^${SHOT_FILE_PREFIX}_${shot.shotNumber}_时长_${shot.duration}_`, 'i');
      const matched = imageAssets.find((asset) => regex.test(asset.filename || ''));
      return matched ? { ...shot, selectedImage: matched.url } : shot;
    });
    setShots(withMatches);
    onProgress?.(withMatches);
  }, [assets, imageAssets, shots.length, onProgress]);

  const updateShot = (index: number, updater: (shot: ShotVideoItem) => ShotVideoItem) => {
    setShots((prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      next[index] = updater(prev[index]);
      onProgress?.(next);
      return next;
    });
  };

  const handleSelectAsset = (assetId: string) => {
    const asset = imageAssets.find((a) => String(a.id) === assetId);
    if (!asset) return;
    updateShot(selectedShotIndex, (shot) => ({
      ...shot,
      selectedImage: asset.url,
      uploadedFile: null,
    }));
  };

  const handleUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      updateShot(selectedShotIndex, (shot) => ({
        ...shot,
        selectedImage: dataUrl,
        uploadedFile: file,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleFrameInfoChange = (value: string) => {
    updateShot(selectedShotIndex, (shot) => ({
      ...shot,
      frameInfoText: value,
    }));
  };

  const filenameForShot = (shot: ShotVideoItem) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `${SHOT_FILE_PREFIX}_${shot.shotNumber}_${ts}.mp4`;
  };

  const stopProgressPoll = (jobId?: string) => {
    if (!jobId) return;
    const timer = progressTimers.current.get(jobId);
    if (timer) {
      clearInterval(timer);
      progressTimers.current.delete(jobId);
    }
  };

  const startProgressPoll = (jobId: string, index: number) => {
    stopProgressPoll(jobId);
    let missCount = 0;
    const timer = setInterval(async () => {
      try {
        const state = await workbenchService.getProgress(jobId);
        if (!state) {
          missCount += 1;
          if (missCount >= 3) {
            updateShot(index, (shot) => ({
              ...shot,
              status: 'failed',
              isGenerating: false,
            }));
            stopProgressPoll(jobId);
          }
          return;
        }
        missCount = 0;
        updateShot(index, (shot) => ({
          ...shot,
          progress: state.progress ?? shot.progress ?? 0,
          status: state.status || shot.status,
          isGenerating: state.status === 'completed' || state.status === 'failed' ? false : shot.isGenerating,
        }));
        if (state.status === 'completed' || state.status === 'failed') {
          stopProgressPoll(jobId);
        }
      } catch {
        // silent polling errors
      }
    }, 2500);
    progressTimers.current.set(jobId, timer);
  };

  const handleGenerate = async () => {
    if (!selectedShot) return;
    setError(null);
    if (selectedShot.jobId) {
      stopProgressPoll(selectedShot.jobId);
    }
    const jobId = `shot-${selectedShot.shotNumber}-${Date.now()}`;
    updateShot(selectedShotIndex, (shot) => ({
      ...shot,
      isGenerating: true,
      jobId,
      progress: 5,
      status: 'submitted',
    }));
    startProgressPoll(jobId, selectedShotIndex);
    try {
      // Validate JSON
      let parsed: any;
      try {
        parsed = JSON.parse(selectedShot.frameInfoText || '{}');
      } catch {
        throw new Error('Frame_Info JSON 格式不正确');
      }

      const inputs: Record<string, any> = {
        Frame_Info: JSON.stringify(parsed),
      };
      if (selectedShot.selectedImage) {
        inputs.input_reference = selectedShot.selectedImage;
      }

      const namedFiles =
        selectedShot.uploadedFile && selectedShot.uploadedFile instanceof File
          ? { input_reference: selectedShot.uploadedFile }
          : undefined;

      const result = await workbenchService.runTool(
        '关键帧转视频',
        inputs,
        undefined,
        {
          modelConfig: { seconds, clientJobId: jobId },
          spaceId,
          namedFiles,
        },
      );

      updateShot(selectedShotIndex, (shot) => ({
        ...shot,
        progress: 95,
        status: 'saving',
      }));
      const url =
        result?.savedAssets?.[0]?.url ||
        result?.mediaUrls?.[0] ||
        result?.outputText ||
        result?.url;
      if (!url) {
        throw new Error('生成结果为空，请重试');
      }

      const fileName = filenameForShot(selectedShot);
      const savedPath = await workbenchService.saveVideoToSpace(spaceId, fileName, url);

      updateShot(selectedShotIndex, (shot) => ({
        ...shot,
        savedVideoUrl: savedPath || url,
        savedPath,
        seconds,
        progress: 100,
        status: 'completed',
      }));
      stopProgressPoll(jobId);
    } catch (err: any) {
      setError(err?.message || '生成失败，请稍后重试');
      updateShot(selectedShotIndex, (shot) => ({
        ...shot,
        status: 'failed',
        progress: shot.progress || 0,
        isGenerating: false,
      }));
      stopProgressPoll(jobId);
    } finally {
      stopProgressPoll(jobId);
      updateShot(selectedShotIndex, (shot) => ({
        ...shot,
        isGenerating: false,
      }));
      setTimeout(() => {
        updateShot(selectedShotIndex, (shot) => ({
          ...shot,
          status: shot.status === 'completed' ? 'completed' : shot.status,
        }));
      }, 500);
    }
  };

  if (loading) {
    return (
      <div className={styles.stepContainer}>
        <div className={styles.loading}>加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.stepContainer}>
        <div className={styles.errorMessage}>{error}</div>
        <button className={styles.backBtn} onClick={onBack}>
          ← 返回
        </button>
      </div>
    );
  }

  if (!shots.length) {
    return (
      <div className={styles.stepContainer}>
        <div className={styles.errorMessage}>未找到镜头数据</div>
        <button className={styles.backBtn} onClick={onBack}>
          ← 返回
        </button>
      </div>
    );
  }

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <h2>第五步：关键帧转视频</h2>
        <p className={styles.stepDescription}>
          为每个镜头选择参考图、编辑 Frame_Info，并生成视频
        </p>
      </div>

      <div className={styles.videoLayout}>
        <div className={styles.videoSidebar}>
          <h4>镜头列表</h4>
          <ul className={styles.shotList}>
            {shots.map((shot, index) => (
              <li
                key={shot.shotNumber}
                className={`${styles.shotItem} ${index === selectedShotIndex ? styles.active : ''}`}
              onClick={() => {
                setSelectedShotIndex(index);
                const sec = (shot.seconds || 10) as 10 | 15;
                setSeconds(sec);
                onSecondsChange?.(sec);
              }}
            >
                <div>
                  <div className={styles.shotTitle}>镜头 {shot.shotNumber}</div>
                  <div className={styles.shotMeta}>时长 {shot.duration} 秒</div>
                </div>
                {shot.savedVideoUrl && <span className={styles.badge}>已生成</span>}
              </li>
            ))}
          </ul>
          <button className={styles.backBtn} onClick={onBack}>
            ← 上一步
          </button>
        </div>

        <div className={styles.videoMain}>
          <div className={styles.formRow}>
            <label>Frame_Info (可编辑)</label>
            <textarea
              className={styles.jsonTextarea}
              rows={12}
              value={selectedShot?.frameInfoText || ''}
              onChange={(e) => handleFrameInfoChange(e.target.value)}
              disabled={selectedShot?.isGenerating}
            />
          </div>

          <div className={styles.formRow}>
            <label>参考图</label>
            <div className={styles.referenceSelector}>
              <select
                value={
                  selectedShot?.selectedImage
                    ? imageAssets.find((a) => a.url === selectedShot.selectedImage)?.id || ''
                    : ''
                }
                onChange={(e) => handleSelectAsset(e.target.value)}
                disabled={selectedShot?.isGenerating}
              >
                <option value="">从资产空间选择图片</option>
                {imageAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.filename}
                  </option>
                ))}
              </select>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleUpload(e.target.files ? e.target.files[0] : null)}
                disabled={selectedShot?.isGenerating}
              />
            </div>
            {selectedShot?.selectedImage && (
              <div className={styles.mediaPreview}>
                <img src={selectedShot.selectedImage} alt="参考图预览" />
              </div>
            )}
          </div>

          <div className={styles.formRow}>
            <label>视频时长</label>
            <div className={styles.segmented}>
              {[10, 15].map((val) => (
                <button
                  key={val}
                  className={`${styles.segmentBtn} ${seconds === val ? styles.segmentActive : ''}`}
                  onClick={() => {
                    const sec = val as 10 | 15;
                    setSeconds(sec);
                    onSecondsChange?.(sec);
                    updateShot(selectedShotIndex, (shot) => ({ ...shot, seconds: sec }));
                  }}
                  disabled={selectedShot?.isGenerating}
                >
                  {val} 秒
                </button>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.nextBtn}
              onClick={handleGenerate}
              disabled={selectedShot?.isGenerating || !selectedShot?.frameInfoText}
            >
              {selectedShot?.isGenerating ? '生成中...' : '开始生成'}
            </button>
          </div>

          {(selectedShot?.status || selectedShot?.progress !== undefined) && (
            <div className={styles.progressBar}>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${selectedShot?.progress || 0}%` }} />
              </div>
              <div className={styles.progressText}>
                状态: {selectedShot?.status || 'pending'} {selectedShot?.progress !== undefined ? `(${Math.round(selectedShot.progress)}%)` : ''}
              </div>
            </div>
          )}

          {selectedShot?.savedVideoUrl && (
            <div className={styles.mediaPreview}>
              <video src={selectedShot.savedVideoUrl} controls />
              <div className={styles.savedStatus}>已保存: {selectedShot.savedPath || selectedShot.savedVideoUrl}</div>
            </div>
          )}

          {error && <div className={styles.errorMessage}>{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default KeyframeVideo;
