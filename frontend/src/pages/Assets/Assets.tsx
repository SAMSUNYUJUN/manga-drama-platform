/**
 * Asset list page
 * @module pages/Assets
 */

import { useEffect, useState } from 'react';
import { assetService } from '../../services';
import type { Asset } from '@shared/types/asset.types';
import styles from './Assets.module.scss';

export const Assets = () => {
  const [assets, setAssets] = useState<Asset[]>([]);

  const loadAssets = async () => {
    const data = await assetService.listAssets();
    setAssets(data.items);
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const handleTrash = async (id: number) => {
    await assetService.trashAsset(id);
    await loadAssets();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>资产管理</h1>
        <p>当前版本资产列表</p>
      </header>
      <div className={styles.list}>
        {assets.map((asset) => (
          <div key={asset.id} className={styles.item}>
            <div>
              <div className={styles.title}>#{asset.id} {asset.filename}</div>
              <div className={styles.meta}>{asset.type}</div>
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
      </div>
    </div>
  );
};
