/**
 * 数据库模块配置
 * @module database
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, Task, TaskVersion, Asset, AssetSpace, WorkflowTemplate, WorkflowTemplateVersion, WorkflowRun, NodeRun, HumanReviewDecisionEntity, PromptTemplate, PromptTemplateVersion, ProviderConfig, GlobalConfig, TrashAsset, NodeTool } from './entities';
import * as path from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'sqlite',
        database: configService.get<string>('DATABASE_PATH', './database.sqlite'),
        entities: [
          User,
          Task,
          TaskVersion,
          Asset,
          AssetSpace,
          WorkflowTemplate,
          WorkflowTemplateVersion,
          WorkflowRun,
          NodeRun,
          HumanReviewDecisionEntity,
          PromptTemplate,
          PromptTemplateVersion,
          ProviderConfig,
          GlobalConfig,
          TrashAsset,
          NodeTool,
        ],
        migrations: [path.join(__dirname, 'migrations/*{.ts,.js}')],
        migrationsRun: true,
        synchronize: false,
        // Only log errors and slow queries (> 1s), not every query
        logging: configService.get<string>('NODE_ENV') !== 'production' 
          ? ['error', 'warn', 'migration']
          : false,
        maxQueryExecutionTime: 1000, // Log queries taking longer than 1 second
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
