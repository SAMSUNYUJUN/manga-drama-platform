/**
 * Trash service
 * @module asset/trash
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Asset, TrashAsset } from '../database/entities';
import { AssetStatus } from '@shared/constants';
import type { IStorageService } from '../storage/storage.interface';
import { Inject } from '@nestjs/common';

@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(
    @Inject('IStorageService') private readonly storageService: IStorageService,
    @InjectRepository(TrashAsset)
    private readonly trashRepository: Repository<TrashAsset>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
  ) {}

  async trashAsset(
    asset: Asset,
    options?: { originRunId?: number | null; originNodeId?: string | null; metadata?: Record<string, any> },
  ): Promise<TrashAsset> {
    if (asset.status !== AssetStatus.TRASHED) {
      asset.status = AssetStatus.TRASHED;
      asset.trashedAt = new Date();
      await this.assetRepository.save(asset);
    }
    const existing = await this.trashRepository.findOne({ where: { assetId: asset.id } });
    if (existing) {
      existing.expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      if (options?.metadata) {
        existing.metadataJson = JSON.stringify(options.metadata);
      }
      return await this.trashRepository.save(existing);
    }
    return await this.trashRepository.save(
      this.trashRepository.create({
        assetId: asset.id,
        originRunId: options?.originRunId ?? null,
        originNodeId: options?.originNodeId ?? null,
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        metadataJson: options?.metadata ? JSON.stringify(options.metadata) : null,
      }),
    );
  }

  async createTrashRecord(payload: {
    metadata?: Record<string, any>;
    originRunId?: number | null;
    originNodeId?: string | null;
  }): Promise<TrashAsset> {
    return await this.trashRepository.save(
      this.trashRepository.create({
        assetId: null,
        originRunId: payload.originRunId ?? null,
        originNodeId: payload.originNodeId ?? null,
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        metadataJson: payload.metadata ? JSON.stringify(payload.metadata) : null,
      }),
    );
  }

  async removeTrashRecordByAssetId(assetId: number): Promise<void> {
    await this.trashRepository.delete({ assetId });
  }

  async cleanupExpiredTrash(): Promise<number> {
    const expired = await this.trashRepository.find({
      where: { expireAt: LessThanOrEqual(new Date()) },
    });
    let cleaned = 0;
    for (const record of expired) {
      try {
        if (record.assetId) {
          const asset = await this.assetRepository.findOne({ where: { id: record.assetId } });
          if (asset) {
            await this.storageService.delete(asset.url);
            await this.assetRepository.remove(asset);
          }
        }
        await this.trashRepository.remove(record);
        cleaned += 1;
      } catch (error) {
        this.logger.warn(`Failed to cleanup trash asset ${record.id}`);
      }
    }
    return cleaned;
  }
}
