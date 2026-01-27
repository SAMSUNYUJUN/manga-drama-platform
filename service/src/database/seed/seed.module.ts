/**
 * Seed module
 * @module database/seed
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  User,
  Task,
  TaskVersion,
  WorkflowTemplate,
  WorkflowTemplateVersion,
  WorkflowRun,
  ProviderConfig,
  GlobalConfig,
  PromptTemplate,
  PromptTemplateVersion,
  NodeTool,
} from '../entities';
import { SeedService } from './seed.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      User,
      Task,
      TaskVersion,
      WorkflowTemplate,
      WorkflowTemplateVersion,
      WorkflowRun,
      ProviderConfig,
      GlobalConfig,
      PromptTemplate,
      PromptTemplateVersion,
      NodeTool,
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
