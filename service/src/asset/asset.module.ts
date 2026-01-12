/**
 * 资产模块
 * @module asset
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset, Task, TrashAsset } from '../database/entities';
import { AssetService } from './asset.service';
import { AssetController } from './asset.controller';
import { StorageModule } from '../storage/storage.module';
import { TrashService } from './trash.service';
import { TrashCleanupService } from './trash-cleanup.service';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, Task, TrashAsset]), StorageModule],
  controllers: [AssetController],
  providers: [AssetService, TrashService, TrashCleanupService],
  exports: [AssetService, TrashService],
})
export class AssetModule {}
