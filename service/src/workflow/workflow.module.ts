/**
 * Workflow module
 * @module workflow
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  WorkflowTemplate,
  WorkflowTemplateVersion,
  WorkflowRun,
  NodeRun,
  Task,
  TaskVersion,
  Asset,
  AssetSpace,
  HumanReviewDecisionEntity,
  TrashAsset,
} from '../database/entities';
import { WorkflowTemplateService } from './workflow-template.service';
import { WorkflowRunService } from './workflow-run.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowValidationService } from './workflow-validation.service';
import { AIServiceModule } from '../ai-service/ai-service.module';
import { StorageModule } from '../storage/storage.module';
import { PromptModule } from '../prompt/prompt.module';
import { AssetModule } from '../asset/asset.module';
import { NodeToolModule } from '../node-tool/node-tool.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowTemplate,
      WorkflowTemplateVersion,
      WorkflowRun,
      NodeRun,
      Task,
      TaskVersion,
      Asset,
      AssetSpace,
      HumanReviewDecisionEntity,
      TrashAsset,
    ]),
    AIServiceModule,
    StorageModule,
    PromptModule,
    AssetModule,
    NodeToolModule,
  ],
  providers: [WorkflowTemplateService, WorkflowRunService, WorkflowValidationService],
  controllers: [WorkflowController],
  exports: [WorkflowRunService, WorkflowTemplateService, WorkflowValidationService],
})
export class WorkflowModule {}
