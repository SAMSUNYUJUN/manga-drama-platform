/**
 * Trash assets page
 * @module pages/Trash
 */

import { useEffect, useState } from 'react';
import { assetService } from '../../services';
import type { Asset } from '@shared/types/asset.types';
import { AssetStatus } from '@shared/constants';
import { useAuth } from '../../hooks/useAuth';
import styles from './Trash.module.scss';

export const Trash = () => {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const loadAssets = async () => {
    const data = await assetService.listAssets({ status: AssetStatus.TRASHED });
    setAssets(data.items);
    setSelectedIds(new Set()); // 清空选择
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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

  const handleRestore = async (id: number) => {
    await assetService.restoreAsset(id);
    await loadAssets();
  };

  const handleHardDelete = async (id: number) => {
    const token = prompt('输入确认 token 以永久删除:');
    if (!token) return;
    await assetService.hardDeleteAsset(id, token);
    await loadAssets();
  };

  const handleBatchRestore = async () => {
    if (selectedIds.size === 0) return;
    await assetService.batchRestoreAssets(Array.from(selectedIds));
    await loadAssets();
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const token = prompt(`输入确认 token 以永久删除 ${selectedIds.size} 个资产:`);
    if (!token) return;
    await assetService.batchHardDeleteAssets(Array.from(selectedIds), token);
    await loadAssets();
  };

  const isAllSelected = assets.length > 0 && selectedIds.size === assets.length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>垃圾桶</h1>
        <p>软删除资产可在此恢复</p>
      </header>

      {assets.length > 0 && (
        <div className={styles.batchActions}>
          <label className={styles.selectAll}>
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleSelectAll}
            />
            全选 ({selectedIds.size}/{assets.length})
          </label>
          <div className={styles.batchButtons}>
            <button
              className="btn btn--secondary btn--sm"
              onClick={handleBatchRestore}
              disabled={selectedIds.size === 0}
            >
              批量恢复
            </button>
            {user?.role === 'ADMIN' && (
              <button
                className="btn btn--danger btn--sm"
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
              >
                批量永久删除
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.list}>
        {assets.map((asset) => (
          <div key={asset.id} className={styles.item}>
            <input
              type="checkbox"
              checked={selectedIds.has(asset.id)}
              onChange={() => toggleSelect(asset.id)}
              className={styles.checkbox}
            />
            <div className={styles.info}>
              <div className={styles.title}>#{asset.id} {asset.filename}</div>
              <div className={styles.meta}>{asset.type}</div>
            </div>
            <div className={styles.actions}>
              <button className="btn btn--secondary btn--sm" onClick={() => handleRestore(asset.id)}>
                恢复
              </button>
              {user?.role === 'ADMIN' && (
                <button className="btn btn--danger btn--sm" onClick={() => handleHardDelete(asset.id)}>
                  永久删除
                </button>
              )}
            </div>
          </div>
        ))}
        {assets.length === 0 && (
          <div className={styles.empty}>垃圾桶是空的</div>
        )}
      </div>
    </div>
  );
};
