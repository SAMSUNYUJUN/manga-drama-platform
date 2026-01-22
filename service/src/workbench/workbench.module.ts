import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkbenchController } from './workbench.controller';
import { WorkbenchService } from './workbench.service';
import { NodeTool } from '../database/entities/node-tool.entity';
import { AssetSpace } from '../database/entities/asset-space.entity';
import { Asset } from '../database/entities/asset.entity';
import { NodeToolModule } from '../node-tool/node-tool.module';
import { StorageModule } from '../storage/storage.module';
import { AIServiceModule } from '../ai-service/ai-service.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NodeTool, AssetSpace, Asset]),
    NodeToolModule,
    StorageModule,
    AIServiceModule,
  ],
  controllers: [WorkbenchController],
  providers: [WorkbenchService],
  exports: [WorkbenchService],
})
export class WorkbenchModule {}
