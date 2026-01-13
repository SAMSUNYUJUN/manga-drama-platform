/**
 * 资产服务
 * @module asset
 */

import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Asset, Task, User } from '../database/entities';
import { QueryAssetDto } from './dto';
import { AssetStatus, UserRole } from '@shared/constants';
import { PaginatedResponse } from '@shared/types';
import { ConfigService } from '@nestjs/config';
import type { IStorageService } from '../storage/storage.interface';
import { TrashService } from './trash.service';

@Injectable()
export class AssetService {
  constructor(
    private readonly configService: ConfigService,
    @Inject('IStorageService') private readonly storageService: IStorageService,
    private readonly trashService: TrashService,
    @InjectRepository(Asset)
    private assetRepository: Repository<Asset>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
  ) {}

  /**
   * 查询资产列表
   */
  async findAll(queryDto: QueryAssetDto, user: User): Promise<PaginatedResponse<Asset>> {
    const { taskId, spaceId, versionId, type, status, page = 1, limit = 20 } = queryDto;

    const query = this.assetRepository
      .createQueryBuilder('asset')
      .leftJoinAndSelect('asset.task', 'task')
      .leftJoinAndSelect('asset.space', 'space');

    if (user.role !== UserRole.ADMIN) {
      query.where(
        new Brackets((qb) => {
          qb.where('task.userId = :userId', { userId: user.id }).orWhere('space.userId = :userId', {
            userId: user.id,
          });
        }),
      );
    }

    if (taskId) {
      query.andWhere('asset.taskId = :taskId', { taskId });
    }

    if (spaceId) {
      query.andWhere('asset.spaceId = :spaceId', { spaceId });
    }

    if (versionId) {
      query.andWhere('asset.versionId = :versionId', { versionId });
    }

    if (type) {
      query.andWhere('asset.type = :type', { type });
    }

    if (status) {
      query.andWhere('asset.status = :status', { status });
    }

    query.orderBy('asset.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [items, total] = await query.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取资产详情
   */
  async findOne(id: number, user: User): Promise<Asset> {
    const asset = await this.assetRepository
      .createQueryBuilder('asset')
      .leftJoinAndSelect('asset.task', 'task')
      .leftJoinAndSelect('asset.space', 'space')
      .where('asset.id = :id', { id })
      .getOne();

    if (!asset) {
      throw new NotFoundException(`Asset with ID ${id} not found`);
    }

    // 权限检查
    const ownerId = asset.task?.userId ?? asset.space?.userId;
    if (user.role !== UserRole.ADMIN && ownerId !== user.id) {
      throw new ForbiddenException('You can only view your own assets');
    }

    return asset;
  }

  /**
   * 删除资产
   */
  async remove(id: number, user: User): Promise<void> {
    const asset = await this.assetRepository
      .createQueryBuilder('asset')
      .leftJoinAndSelect('asset.task', 'task')
      .leftJoinAndSelect('asset.space', 'space')
      .where('asset.id = :id', { id })
      .getOne();

    if (!asset) {
      throw new NotFoundException(`Asset with ID ${id} not found`);
    }

    // 权限检查
    const ownerId = asset.task?.userId ?? asset.space?.userId;
    if (user.role !== UserRole.ADMIN && ownerId !== user.id) {
      throw new ForbiddenException('You can only delete your own assets');
    }

    await this.assetRepository.remove(asset);
  }

  /**
   * 标记资产为垃圾桶
   */
  async trash(id: number, user: User): Promise<Asset> {
    const asset = await this.findOne(id, user);
    if (asset.status === AssetStatus.TRASHED) {
      return asset;
    }
    await this.trashService.trashAsset(asset);
    return asset;
  }

  /**
   * 恢复资产
   */
  async restore(id: number, user: User): Promise<Asset> {
    const asset = await this.findOne(id, user);
    asset.status = AssetStatus.ACTIVE;
    asset.trashedAt = null;
    const saved = await this.assetRepository.save(asset);
    await this.trashService.removeTrashRecordByAssetId(id);
    return saved;
  }

  /**
   * 硬删除资产（管理员 + 确认token）
   */
  async hardDelete(id: number, confirmToken: string | undefined, user: User): Promise<void> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can hard delete assets');
    }

    const requiredToken = this.configService.get<string>('ASSET_HARD_DELETE_TOKEN', 'HARD_DELETE');
    if (!confirmToken || confirmToken !== requiredToken) {
      throw new BadRequestException('Invalid hard delete confirmation token');
    }

    const asset = await this.assetRepository.findOne({ where: { id } });
    if (!asset) {
      throw new NotFoundException(`Asset with ID ${id} not found`);
    }

    await this.storageService.delete(asset.url);
    await this.assetRepository.remove(asset);
    await this.trashService.removeTrashRecordByAssetId(id);
  }

  /**
   * 创建资产记录
   */
  async createAsset(payload: Partial<Asset>): Promise<Asset> {
    if (!payload.taskId && !payload.spaceId) {
      throw new BadRequestException('taskId or spaceId is required');
    }
    const asset = this.assetRepository.create({
      status: AssetStatus.ACTIVE,
      ...payload,
    });
    return await this.assetRepository.save(asset);
  }

  /**
   * 资产替换
   */
  async replaceAsset(originalAssetId: number, newAssetId: number): Promise<void> {
    const asset = await this.assetRepository.findOne({ where: { id: originalAssetId } });
    if (!asset) {
      throw new NotFoundException(`Asset with ID ${originalAssetId} not found`);
    }
    asset.status = AssetStatus.REPLACED;
    asset.replacedById = newAssetId;
    await this.assetRepository.save(asset);
  }
}
