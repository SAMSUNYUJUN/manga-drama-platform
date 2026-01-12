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

  const loadAssets = async () => {
    const data = await assetService.listAssets({ status: AssetStatus.TRASHED });
    setAssets(data.items);
  };

  useEffect(() => {
    loadAssets();
  }, []);

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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>垃圾桶</h1>
        <p>软删除资产可在此恢复</p>
      </header>

      <div className={styles.list}>
        {assets.map((asset) => (
          <div key={asset.id} className={styles.item}>
            <div>
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
      </div>
    </div>
  );
};
