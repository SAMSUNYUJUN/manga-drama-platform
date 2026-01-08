/**
 * 资产服务
 * @module asset
 */

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset, Task, User } from '../database/entities';
import { QueryAssetDto } from './dto';
import { UserRole } from '@shared/constants';
import { PaginatedResponse } from '@shared/types';

@Injectable()
export class AssetService {
  constructor(
    @InjectRepository(Asset)
    private assetRepository: Repository<Asset>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
  ) {}

  /**
   * 查询资产列表
   */
  async findAll(queryDto: QueryAssetDto, user: User): Promise<PaginatedResponse<Asset>> {
    const { taskId, versionId, type, page = 1, limit = 20 } = queryDto;

    const query = this.assetRepository
      .createQueryBuilder('asset')
      .leftJoinAndSelect('asset.task', 'task')
      .where('task.userId = :userId', { userId: user.id });

    if (taskId) {
      query.andWhere('asset.taskId = :taskId', { taskId });
    }

    if (versionId) {
      query.andWhere('asset.versionId = :versionId', { versionId });
    }

    if (type) {
      query.andWhere('asset.type = :type', { type });
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
      .where('asset.id = :id', { id })
      .getOne();

    if (!asset) {
      throw new NotFoundException(`Asset with ID ${id} not found`);
    }

    // 权限检查
    if (asset.task.userId !== user.id && user.role !== UserRole.ADMIN) {
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
      .where('asset.id = :id', { id })
      .getOne();

    if (!asset) {
      throw new NotFoundException(`Asset with ID ${id} not found`);
    }

    // 权限检查
    if (asset.task.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only delete your own assets');
    }

    await this.assetRepository.remove(asset);
  }
}
