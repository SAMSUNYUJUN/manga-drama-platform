/**
 * 资产空间服务
 * @module asset/asset-space
 */

import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset, AssetSpace, User } from '../database/entities';
import { AssetType, UserRole } from '@shared/constants';
import type { IStorageService } from '../storage/storage.interface';
import { TrashService } from './trash.service';

@Injectable()
export class AssetSpaceService {
  private readonly logger = new Logger(AssetSpaceService.name);

  constructor(
    @InjectRepository(AssetSpace)
    private readonly spaceRepository: Repository<AssetSpace>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    @Inject('IStorageService')
    private readonly storageService: IStorageService,
    private readonly trashService: TrashService,
  ) {}

  async listSpaces(user: User): Promise<AssetSpace[]> {
    if (user.role === UserRole.ADMIN) {
      return await this.spaceRepository.find({ order: { updatedAt: 'DESC' } });
    }
    return await this.spaceRepository.find({ where: { userId: user.id }, order: { updatedAt: 'DESC' } });
  }

  async getSpace(id: number, user: User): Promise<AssetSpace> {
    const space = await this.spaceRepository.findOne({ where: { id } });
    if (!space) {
      throw new NotFoundException(`AssetSpace with ID ${id} not found`);
    }
    if (user.role !== UserRole.ADMIN && space.userId !== user.id) {
      throw new ForbiddenException('You can only access your own spaces');
    }
    return space;
  }

  async createSpace(payload: { name: string; description?: string }, user: User): Promise<AssetSpace> {
    if (!payload.name?.trim()) {
      throw new BadRequestException('Space name is required');
    }
    const existing = await this.spaceRepository.findOne({ where: { name: payload.name.trim(), userId: user.id } });
    if (existing) {
      throw new BadRequestException('Space name already exists');
    }
    const space = this.spaceRepository.create({
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      userId: user.id,
    });
    return await this.spaceRepository.save(space);
  }

  async deleteSpace(id: number, user: User): Promise<void> {
    const space = await this.getSpace(id, user);
    const assets = await this.assetRepository.find({ where: { spaceId: id } });
    for (const asset of assets) {
      try {
        await this.storageService.delete(asset.url);
      } catch (error) {
        this.logger.warn(`Failed to delete space asset ${asset.id}`);
      }
      await this.trashService.removeTrashRecordByAssetId(asset.id);
    }
    if (assets.length) {
      await this.assetRepository.remove(assets);
    }
    await this.spaceRepository.remove(space);
  }

  async uploadAssets(spaceId: number, files: Express.Multer.File[], user: User): Promise<Asset[]> {
    const space = await this.getSpace(spaceId, user);
    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }
    const results: Asset[] = [];
    for (const file of files) {
      const assetType = this.resolveAssetType(file.mimetype);
      const folder = this.buildAssetFolder(space.userId, space.id, assetType);
      const filename = this.buildFilename(file.originalname);
      const url = await this.storageService.uploadBuffer(file.buffer, filename, {
        folder,
        contentType: file.mimetype,
        isPublic: false,
      });
      const asset = this.assetRepository.create({
        taskId: null,
        versionId: null,
        spaceId: space.id,
        type: assetType,
        url,
        filename: file.originalname,
        filesize: file.size,
        mimeType: file.mimetype,
        metadataJson: JSON.stringify({ originalFilename: file.originalname }),
      });
      results.push(await this.assetRepository.save(asset));
    }
    return results;
  }

  private resolveAssetType(mimeType: string): AssetType {
    if (mimeType?.startsWith('image/')) {
      return AssetType.TASK_EXECUTION;
    }
    if (mimeType?.startsWith('video/')) {
      return AssetType.TASK_EXECUTION;
    }
    return AssetType.TASK_EXECUTION;
  }

  private buildAssetFolder(userId: number, spaceId: number, type: AssetType): string {
    return `users/${userId}/spaces/${spaceId}/${type}`;
  }

  private buildFilename(originalName: string): string {
    const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
    return `asset_${Date.now()}.${ext}`;
  }
}
