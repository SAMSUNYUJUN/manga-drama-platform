import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoryboardShot, StoryboardMessage, NodeTool, AssetSpace, Asset } from '../database/entities';
import { StoryboardService } from './storyboard.service';
import { StoryboardController } from './storyboard.controller';
import { PromptModule } from '../prompt/prompt.module';
import { AIServiceModule } from '../ai-service/ai-service.module';
import { StorageModule } from '../storage/storage.module';
import { AssetModule } from '../asset/asset.module';
import { NodeToolModule } from '../node-tool/node-tool.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoryboardShot, StoryboardMessage, NodeTool, AssetSpace, Asset]),
    PromptModule,
    AIServiceModule,
    StorageModule,
    AssetModule,
    NodeToolModule,
  ],
  controllers: [StoryboardController],
  providers: [StoryboardService],
  exports: [StoryboardService],
})
export class StoryboardModule {}
