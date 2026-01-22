/**
 * 第三步：定妆照生成组件
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { 
  ScriptAnalysisResult, 
  CostumePhotoType,
  CostumePhotoItem,
} from '@shared/types/workbench.types';
import * as workbenchService from '../../../services/workbench.service';
import styles from '../Workbench.module.scss';

interface CostumePhotoProps {
  spaceId: number;
  analysisResult?: ScriptAnalysisResult;
  scriptAnalysisPath?: string;
  initialItems?: CostumePhotoItem[] | null;
  onBack: () => void;
  onComplete: () => void;
  onProgress?: (items: CostumePhotoItem[]) => void;
}

type TabType = 'character' | 'scene' | 'prop';

interface PhotoItem {
  id: string;
  type: CostumePhotoType;
  name: string;
  description: string;
  images: string[];
  failedImages: string[];
  isGenerating: boolean;
  regeneratingImages: string[];
  savedImage?: string;
  savedPath?: string;
}

const CostumePhoto: React.FC<CostumePhotoProps> = ({
  spaceId,
  analysisResult,
  scriptAnalysisPath,
  initialItems,
  onBack,
  onComplete,
  onProgress,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('character');
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);
  const [selectedImage, setSelectedImage] = useState<{ item: PhotoItem; imageUrl: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState<{ item: PhotoItem; imageUrl: string } | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const getInputType = (type: CostumePhotoType): '人物' | '场景' | '道具' => {
    switch (type) {
      case 'character': return '人物';
      case 'scene': return '场景';
      case 'prop': return '道具';
    }
  };

  const buildItemsFromAnalysis = (analysis: ScriptAnalysisResult): PhotoItem[] => {
    const items: PhotoItem[] = [];

    analysis.人物.forEach((char, index) => {
      items.push({
        id: `character_${index}`,
        type: 'character',
        name: char.人物姓名,
        description: JSON.stringify({
          姓名: char.人物姓名,
          性别: char.性别,
          外貌特征描写: char.外貌特征描写,
        }),
        images: [],
        failedImages: [],
        regeneratingImages: [],
        isGenerating: false,
      });
    });

    analysis.场景.forEach((scene, index) => {
      items.push({
        id: `scene_${index}`,
        type: 'scene',
        name: scene.地点名称,
        description: JSON.stringify({
          地点名称: scene.地点名称,
          环境氛围描写: scene.环境氛围描写,
        }),
        images: [],
        failedImages: [],
        regeneratingImages: [],
        isGenerating: false,
      });
    });

    analysis.道具.forEach((prop, index) => {
      items.push({
        id: `prop_${index}`,
        type: 'prop',
        name: prop.道具名称,
        description: JSON.stringify({
          道具名称: prop.道具名称,
          道具描写: prop.道具描写,
        }),
        images: [],
        failedImages: [],
        regeneratingImages: [],
        isGenerating: false,
      });
    });

    return items;
  };

  const normalizeInitialItems = (items: CostumePhotoItem[]): PhotoItem[] =>
    items.map((item, index) => ({
      id: (item as any).id || `${item.type}_${index}`,
      type: item.type,
      name: item.name,
      description: item.description,
      images: item.images || [],
      failedImages: item.failedImages || [],
      regeneratingImages: item.regeneratingImages || [],
      isGenerating: !!item.isGenerating,
      savedImage: item.savedImage || item.selectedImage,
      savedPath: item.savedPath,
    }));

  // 初始化照片项目（优先已有进度，其次从资产空间文件读取，最后使用传入的分析结果）
  useEffect(() => {
    const init = async () => {
      if (initialized) return;

      if (initialItems && initialItems.length) {
        setPhotoItems(normalizeInitialItems(initialItems));
        setInitialized(true);
        return;
      }

      if (analysisResult) {
        setPhotoItems(buildItemsFromAnalysis(analysisResult));
        setInitialized(true);
        return;
      }

      if (scriptAnalysisPath) {
        try {
          setIsLoadingAnalysis(true);
          const resp = await fetch(scriptAnalysisPath);
          const json = await resp.json();
          setPhotoItems(buildItemsFromAnalysis(json as ScriptAnalysisResult));
          setInitialized(true);
        } catch (err: any) {
          setError(`读取剧本拆解结果失败: ${err?.message || err}`);
        } finally {
          setIsLoadingAnalysis(false);
        }
      }
    };

    init();
  }, [analysisResult, scriptAnalysisPath, initialItems, initialized]);

  // 将进度同步到上层以便持久化
  useEffect(() => {
    if (!onProgress) return;
    const payload: CostumePhotoItem[] = photoItems.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      description: item.description,
      images: item.images,
      failedImages: item.failedImages,
      savedImage: item.savedImage,
      savedPath: item.savedPath,
      savedToSpace: !!item.savedImage,
      selectedImage: item.savedImage,
      isGenerating: item.isGenerating,
      regeneratingImages: item.regeneratingImages,
    }));
    onProgress(payload);
  }, [photoItems]); // onProgress 来自父组件 useCallback，稳定即可省略

  const generatePhotos = async (itemId: string, resetImages: boolean = false) => {
    setPhotoItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              isGenerating: true,
              images: resetImages ? [] : item.images,
              failedImages: resetImages ? [] : item.failedImages,
              regeneratingImages: resetImages ? [] : item.regeneratingImages,
            }
          : item,
      )
    );

    const item = photoItems.find((i) => i.id === itemId);
    if (!item) return;

    try {
      const tasks = Array.from({ length: 3 }, (_, idx) =>
        workbenchService.runCostumePhoto(
          getInputType(item.type),
          item.description
        ).then((imgs) => {
          if (!imgs?.length) {
            const failId = `fail-${Date.now()}-${idx}`;
            setPhotoItems((prev) =>
              prev.map((i) => {
                if (i.id !== itemId) return i;
                return { ...i, failedImages: [...i.failedImages, failId] };
              })
            );
            return;
          }
            setPhotoItems((prev) =>
              prev.map((i) => {
                if (i.id !== itemId) return i;
                const merged = resetImages ? imgs : Array.from(new Set([...i.images, ...imgs]));
                return { ...i, images: merged };
              })
            );
        }).catch((err) => {
          const failId = `fail-${Date.now()}-${idx}`;
          setPhotoItems((prev) =>
            prev.map((i) => {
              if (i.id !== itemId) return i;
              return { ...i, failedImages: [...i.failedImages, failId] };
            })
          );
          console.error(`Failed to generate photos for ${item.name}:`, err);
        })
      );

      await Promise.all(tasks);
    } catch (err: any) {
      console.error(`Failed to generate photos for ${item.name}:`, err);
      setError(`生成定妆照失败: ${err.message || err}`);
    } finally {
      setPhotoItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, isGenerating: false } : i
        )
      );
    }
  };

  const handleImageClick = (item: PhotoItem, imageUrl: string) => {
    setSelectedImage({ item, imageUrl });
  };

  const handleClosePreview = () => {
    setSelectedImage(null);
  };

  const buildFileName = (item: PhotoItem) => {
    const prefix = item.type === 'character' ? '人物' : item.type === 'scene' ? '场景' : '道具';
    const safeName = item.name
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '')
      .slice(0, 50) || '未命名';
    return workbenchService.generateFileName(`${prefix}_${safeName}`, 'png');
  };

  const handleSaveImage = async (item: PhotoItem, imageUrl: string, confirmed: boolean = false) => {
    // 检查是否已有保存的图片
    if (item.savedImage && !confirmed) {
      setConfirmOverwrite({ item, imageUrl });
      return;
    }

    setIsSaving(true);
    setError(null);
    setConfirmOverwrite(null);

    try {
      const fileName = buildFileName(item);
      const path = await workbenchService.saveImageToSpace(spaceId, fileName, imageUrl);

      setPhotoItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, savedImage: imageUrl, savedPath: path } : i
        )
      );

      setSelectedImage(null);
    } catch (err: any) {
      setError(`保存失败: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateImage = async (item: PhotoItem, oldImageUrl: string) => {
    setSelectedImage(null);
    setPhotoItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, regeneratingImages: Array.from(new Set([...(i.regeneratingImages || []), oldImageUrl])) }
          : i,
      ),
    );

    try {
      const newImages = await workbenchService.runCostumePhoto(
        getInputType(item.type),
        item.description
      );

      if (newImages.length > 0) {
        setPhotoItems((prev) =>
          prev.map((i) => {
            if (i.id === item.id) {
              const images = [...i.images];
              const index = images.indexOf(oldImageUrl);
              const failedIndex = i.failedImages.indexOf(oldImageUrl);
              if (index !== -1) {
                images[index] = newImages[0];
              } else if (failedIndex !== -1) {
                const failedImages = [...i.failedImages];
                failedImages.splice(failedIndex, 1);
                return { ...i, images: [...images, newImages[0]], failedImages };
              } else {
                images.push(newImages[0]);
              }
              const regeneratingImages = (i.regeneratingImages || []).filter((u) => u !== oldImageUrl);
              return { ...i, images, regeneratingImages };
            }
            return i;
          })
        );
      } else {
        // 如果再次失败，保留失败占位
        setPhotoItems((prev) =>
          prev.map((i) => {
            if (i.id !== item.id) return i;
            if (i.failedImages.includes(oldImageUrl)) return i;
            const regeneratingImages = (i.regeneratingImages || []).filter((u) => u !== oldImageUrl);
            return { ...i, failedImages: [...i.failedImages, oldImageUrl], regeneratingImages };
          })
        );
      }
    } catch (err: any) {
      setError(`重绘失败: ${err.message}`);
      setPhotoItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, regeneratingImages: (i.regeneratingImages || []).filter((u) => u !== oldImageUrl) }
            : i,
        ),
      );
    }
  };

  const getFilteredItems = useCallback(() => {
    return photoItems.filter((item) => {
      switch (activeTab) {
        case 'character': return item.type === 'character';
        case 'scene': return item.type === 'scene';
        case 'prop': return item.type === 'prop';
      }
    });
  }, [photoItems, activeTab]);

  const handleDescriptionChange = (itemId: string, value: string) => {
    setPhotoItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, description: value } : item)),
    );
  };

  const getTabStats = (tab: TabType) => {
    const items = photoItems.filter((item) => {
      switch (tab) {
        case 'character': return item.type === 'character';
        case 'scene': return item.type === 'scene';
        case 'prop': return item.type === 'prop';
      }
    });
    const saved = items.filter((i) => i.savedImage).length;
    return { total: items.length, saved };
  };

  const isAllSaved = () => {
    return photoItems.length > 0 && photoItems.every((item) => item.savedImage);
  };

  if (isLoadingAnalysis && !photoItems.length) {
    return (
      <div className={styles.stepContainer}>
        <div className={styles.loading}>正在读取剧本拆解结果...</div>
      </div>
    );
  }

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <h2>第三步：定妆照生成</h2>
        <p className={styles.stepDescription}>
          为每个人物、场景、道具生成定妆照，选择最满意的一张保存
        </p>
      </div>

      {error && <div className={styles.errorMessage}>{error}</div>}

      {/* 标签页 */}
      <div className={styles.tabBar}>
        {(['character', 'scene', 'prop'] as TabType[]).map((tab) => {
          const stats = getTabStats(tab);
          const label = tab === 'character' ? '人物' : tab === 'scene' ? '场景' : '道具';
          return (
            <button
              key={tab}
              className={`${styles.tabBtn} ${activeTab === tab ? styles.active : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {label} ({stats.saved}/{stats.total})
            </button>
          );
        })}
      </div>

      {/* 照片网格 */}
      <div className={styles.photoGrid}>
        {getFilteredItems().map((item) => (
          <div key={item.id} className={styles.photoCard}>
            <div className={styles.cardHeader}>
              <h4>{item.name}</h4>
              {item.savedImage && <span className={styles.savedBadge}>✓ 已保存</span>}
            </div>

            <div className={styles.descriptionBox}>
              <div className={styles.descriptionHeader}>
                <span>描述（可编辑）</span>
                <span className={styles.descHint}>修改后点击生成</span>
              </div>
              <textarea
                value={item.description}
                onChange={(e) => handleDescriptionChange(item.id, e.target.value)}
                rows={4}
                disabled={item.isGenerating}
              />
            </div>
            
            <div className={styles.imageGrid}>
              {item.images.length === 0 && item.failedImages.length === 0 && item.isGenerating ? (
                <div className={styles.generatingPlaceholder}>
                  <div className={styles.spinner} />
                  <span>生成中...</span>
                </div>
              ) : item.images.length === 0 && item.failedImages.length === 0 ? (
                <button
                  className={styles.generateBtn}
                  onClick={() => generatePhotos(item.id)}
                  disabled={item.isGenerating}
                >
                  生成定妆照
                </button>
              ) : (
                <>
                  <div className={styles.imageGridInner}>
                    {item.images.map((img, idx) => (
                      <div
                        key={idx}
                        className={`${styles.thumbnail} ${item.savedImage === img ? styles.selected : ''}`}
                        onClick={() => {
                          if (item.regeneratingImages?.includes(img)) return;
                          handleImageClick(item, img);
                        }}
                      >
                        <img src={img} alt={`${item.name} ${idx + 1}`} />
                        {item.regeneratingImages?.includes(img) && (
                          <div className={styles.regeneratingOverlay}>重绘中</div>
                        )}
                        {item.savedImage === img && (
                          <div className={styles.selectedOverlay}>✓</div>
                        )}
                      </div>
                    ))}
                    {item.failedImages.map((failId) => (
                      <div key={failId} className={`${styles.thumbnail} ${styles.failedThumb}`}>
                        <div className={styles.failedOverlay}>
                          <span>生成失败</span>
                          <button onClick={() => handleRegenerateImage(item, failId)}>重绘</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {item.isGenerating && (
                    <div className={styles.generatingOverlay}>继续生成中...</div>
                  )}
                </>
              )}
            </div>

            {item.images.length > 0 && !item.isGenerating && (
              <button
                className={styles.regenerateAllBtn}
                onClick={() => generatePhotos(item.id, true)}
                disabled={item.isGenerating}
              >
                🔄 重新生成全部
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 图片预览弹窗 */}
      {selectedImage && (
        <div className={styles.previewOverlay} onClick={handleClosePreview}>
          <div className={styles.previewContent} onClick={(e) => e.stopPropagation()}>
            <img src={selectedImage.imageUrl} alt={selectedImage.item.name} />
            <div className={styles.previewInfo}>
              <h3>{selectedImage.item.name}</h3>
              <p>{selectedImage.item.description}</p>
            </div>
            <div className={styles.previewActions}>
              <button className={styles.closeBtn} onClick={handleClosePreview}>
                缩小
              </button>
              <button
                className={styles.saveBtn}
                onClick={() => handleSaveImage(selectedImage.item, selectedImage.imageUrl)}
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : '💾 保存定妆照'}
              </button>
              <button
                className={styles.regenerateBtn}
                onClick={() => handleRegenerateImage(selectedImage.item, selectedImage.imageUrl)}
              >
                🔄 重绘
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 确认覆盖弹窗 */}
      {confirmOverwrite && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmDialog}>
            <h3>确认覆盖</h3>
            <p>
              「{confirmOverwrite.item.name}」已有保存的定妆照，
              是否确认覆盖？
            </p>
            <div className={styles.confirmActions}>
              <button onClick={() => setConfirmOverwrite(null)}>取消</button>
              <button
                className={styles.confirmBtn}
                onClick={() => handleSaveImage(confirmOverwrite.item, confirmOverwrite.imageUrl, true)}
              >
                确认覆盖
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.actionBar}>
        <button className={styles.backBtn} onClick={onBack}>
          ← 上一步
        </button>
        
        <div className={styles.progress}>
          已保存: {photoItems.filter((i) => i.savedImage).length} / {photoItems.length}
        </div>

        <button
          className={styles.completeBtn}
          onClick={onComplete}
          disabled={!isAllSaved()}
        >
          {isAllSaved() ? '下一步 →' : '请完成所有定妆照保存'}
        </button>
      </div>
    </div>
  );
};

export default CostumePhoto;
