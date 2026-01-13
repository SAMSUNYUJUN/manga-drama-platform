/**
 * 资产模块
 * @module asset
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset, AssetSpace, Task, TrashAsset } from '../database/entities';
import { AssetService } from './asset.service';
import { AssetController } from './asset.controller';
import { AssetSpaceController } from './asset-space.controller';
import { AssetSpaceService } from './asset-space.service';
import { StorageModule } from '../storage/storage.module';
import { TrashService } from './trash.service';
import { TrashCleanupService } from './trash-cleanup.service';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, AssetSpace, Task, TrashAsset]), StorageModule],
  controllers: [AssetController, AssetSpaceController],
  providers: [AssetService, AssetSpaceService, TrashService, TrashCleanupService],
  exports: [AssetService, AssetSpaceService, TrashService],
})
export class AssetModule {}
