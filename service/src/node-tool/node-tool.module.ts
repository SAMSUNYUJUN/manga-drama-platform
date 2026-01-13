/**
 * Node tool module
 * @module node-tool
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeTool } from '../database/entities';
import { NodeToolService } from './node-tool.service';
import { NodeToolController } from './node-tool.controller';
import { PromptModule } from '../prompt/prompt.module';
import { AIServiceModule } from '../ai-service/ai-service.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([NodeTool]), PromptModule, AIServiceModule, StorageModule],
  providers: [NodeToolService],
  controllers: [NodeToolController],
  exports: [NodeToolService],
})
export class NodeToolModule {}
