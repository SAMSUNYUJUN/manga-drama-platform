/**
 * Asset list page
 * @module pages/Assets
 */

import { useEffect, useState } from 'react';
import { assetService, assetSpaceService } from '../../services';
import type { Asset } from '@shared/types/asset.types';
import type { AssetSpace } from '@shared/types/asset-space.types';
import { AssetStatus, AssetType } from '@shared/constants';
import styles from './Assets.module.scss';

const ASSET_TYPE_LABELS: Record<string, string> = {
  [AssetType.WORKFLOW_TEST]: '工作流测试',
  [AssetType.TASK_EXECUTION]: '任务执行',
};

export const Assets = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [spaces, setSpaces] = useState<AssetSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  const [spaceName, setSpaceName] = useState('');
  const [spaceDescription, setSpaceDescription] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [assetError, setAssetError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const loadSpaces = async () => {
    try {
      setLoadError('');
      const data = await assetSpaceService.listAssetSpaces();
      setSpaces(data);
      setSelectedSpaceId((prev) => {
        if (prev && data.some((space) => space.id === prev)) {
          return prev;
        }
        return data[0]?.id ?? null;
      });
    } catch (error: any) {
      setLoadError(error?.message || '空间加载失败');
    }
  };

  const loadAssets = async (spaceId?: number | null, pageNum: number = 1) => {
    if (!spaceId) {
      setAssets([]);
      setSelectedIds(new Set());
      return;
    }
    try {
      setAssetError('');
      const data = await assetService.listAssets({ spaceId, status: AssetStatus.ACTIVE, page: pageNum, limit: 20 });
      setAssets(data.items);
      setPage(data.page);
      setTotalPages(data.totalPages || 1);
      setSelectedIds(new Set());
    } catch (error: any) {
      setAssets([]);
      setAssetError(error?.message || '资产加载失败');
    }
  };

  useEffect(() => {
    loadSpaces();
  }, []);

  useEffect(() => {
    loadAssets(selectedSpaceId, 1);
  }, [selectedSpaceId]);

  const handleTrash = async (id: number) => {
    try {
      setAssetError('');
      await assetService.trashAsset(id);
      await loadAssets(selectedSpaceId);
    } catch (error: any) {
      setAssetError(error?.message || '放入垃圾桶失败');
    }
  };

  const handleCreateSpace = async () => {
    if (!spaceName.trim()) return;
    try {
      setLoadError('');
      const created = await assetSpaceService.createAssetSpace({
        name: spaceName.trim(),
        description: spaceDescription.trim() || undefined,
      });
      setSpaceName('');
      setSpaceDescription('');
      await loadSpaces();
      setSelectedSpaceId(created.id);
    } catch (error: any) {
      setLoadError(error?.message || '创建空间失败');
    }
  };

  const handleDeleteSpace = async (space: AssetSpace) => {
    if (!window.confirm(`确定删除空间「${space.name}」吗？空间内资产会被删除。`)) return;
    try {
      await assetSpaceService.deleteAssetSpace(space.id);
      await loadSpaces();
      if (selectedSpaceId === space.id) {
        setAssets([]);
      }
    } catch (error: any) {
      setLoadError(error?.message || '删除空间失败');
    }
  };

  const handleUpload = async () => {
    if (!selectedSpaceId || !uploadFiles.length) return;
    setIsUploading(true);
    try {
      setUploadError('');
      await assetSpaceService.uploadAssetsToSpace(selectedSpaceId, uploadFiles);
      setUploadFiles([]);
      await loadAssets(selectedSpaceId, 1);
    } catch (error: any) {
      setUploadError(error?.message || '上传失败');
    } finally {
      setIsUploading(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === assets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(assets.map((a) => a.id)));
    }
  };

  const handleBatchTrash = async () => {
    if (!selectedIds.size) return;
    try {
      await assetService.batchTrashAssets(Array.from(selectedIds));
      await loadAssets(selectedSpaceId);
    } catch (error: any) {
      setAssetError(error?.message || '批量放入垃圾桶失败');
    }
  };

  const handleBatchDownload = async () => {
    if (!selectedIds.size) return;
    try {
      for (const id of Array.from(selectedIds)) {
        const data = await assetService.downloadAsset(id);
        const a = document.createElement('a');
        a.href = data.url;
        a.download = '';
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.click();
      }
    } catch (error: any) {
      setAssetError(error?.message || '批量下载失败');
    }
  };

  const isAllSelected = assets.length > 0 && selectedIds.size === assets.length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>资产管理</h1>
        <p>创建素材空间并上传图片 / 视频等物料</p>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.spaceForm}>
            <input
              placeholder="新空间名称"
              value={spaceName}
              onChange={(event) => setSpaceName(event.target.value)}
            />
            <input
              placeholder="描述（可选）"
              value={spaceDescription}
              onChange={(event) => setSpaceDescription(event.target.value)}
            />
            <button className="btn btn--secondary btn--sm" onClick={handleCreateSpace}>
              创建空间
            </button>
            {loadError && <div className={styles.error}>{loadError}</div>}
          </div>
          <div className={styles.spaceList}>
            {spaces.map((space) => (
              <button
                key={space.id}
                className={`${styles.spaceItem} ${selectedSpaceId === space.id ? styles.spaceItemActive : ''}`}
                onClick={() => setSelectedSpaceId(space.id)}
              >
                <div>
                  <div className={styles.title}>{space.name}</div>
                  <div className={styles.meta}>{space.description || '无描述'}</div>
                </div>
                <span
                  className={styles.spaceDelete}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleDeleteSpace(space);
                  }}
                >
                  删除
                </span>
              </button>
            ))}
            {!spaces.length && <div className={styles.empty}>还没有空间，先创建一个吧。</div>}
          </div>
        </aside>

        <section className={styles.panel}>
          <div className={styles.uploadPanel}>
            <h3>上传物料</h3>
            <p>支持图片与视频，上传后会进入当前空间。</p>
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={(event) => setUploadFiles(event.target.files ? Array.from(event.target.files) : [])}
              disabled={!selectedSpaceId}
            />
            <button
              className="btn btn--primary"
              onClick={handleUpload}
              disabled={!selectedSpaceId || !uploadFiles.length || isUploading}
            >
              {isUploading ? '上传中...' : '开始上传'}
            </button>
            {uploadError && <div className={styles.error}>{uploadError}</div>}
            {!!uploadFiles.length && <div className={styles.meta}>已选择: {uploadFiles.map((file) => file.name).join(', ')}</div>}
          </div>

          <div className={styles.list}>
            {assets.length > 0 && (
              <div className={styles.batchBar}>
                <label className={styles.selectAll}>
                  <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} />
                  全选 ({selectedIds.size}/{assets.length})
                </label>
                <div className={styles.batchButtons}>
                  <button
                    className="btn btn--secondary btn--sm"
                    disabled={selectedIds.size === 0}
                    onClick={handleBatchDownload}
                  >
                    批量下载
                  </button>
                  <button
                    className="btn btn--outline btn--sm"
                    disabled={selectedIds.size === 0}
                    onClick={handleBatchTrash}
                  >
                    批量放入垃圾桶
                  </button>
                </div>
              </div>
            )}
            {assetError && <div className={styles.error}>{assetError}</div>}
            {assets.map((asset) => (
              <div key={asset.id} className={styles.item}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(asset.id)}
                  onChange={() => toggleSelect(asset.id)}
                  className={styles.checkbox}
                />
                <div className={styles.info}>
                  <div className={styles.title}>{asset.filename}</div>
                  <div className={styles.meta}>{ASSET_TYPE_LABELS[asset.type] || asset.type}</div>
                </div>
                <div className={styles.actions}>
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={async () => {
                      const data = await assetService.downloadAsset(asset.id);
                      window.open(data.url, '_blank');
                    }}
                  >
                    下载
                  </button>
                  <button className="btn btn--outline btn--sm" onClick={() => handleTrash(asset.id)}>
                    放入垃圾桶
                  </button>
                </div>
              </div>
            ))}
            {selectedSpaceId && assets.length === 0 && (
              <div className={styles.empty}>当前空间还没有资产。</div>
            )}
            {selectedSpaceId && totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  className="btn btn--outline btn--sm"
                  disabled={page <= 1}
                  onClick={() => loadAssets(selectedSpaceId, page - 1)}
                >
                  上一页
                </button>
                <span className={styles.pageInfo}>
                  第 {page} / {totalPages} 页
                </span>
                <button
                  className="btn btn--outline btn--sm"
                  disabled={page >= totalPages}
                  onClick={() => loadAssets(selectedSpaceId, page + 1)}
                >
                  下一页
                </button>
              </div>
            )}
            {!selectedSpaceId && <div className={styles.empty}>请选择左侧空间查看资产。</div>}
          </div>
        </section>
      </div>
    </div>
  );
};
