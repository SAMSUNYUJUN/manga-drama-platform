/**
 * AI 服务模块
 * @module ai-service
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JimengService } from './jimeng/jimeng.service';
import { SoraService } from './sora/sora.service';
import { LLMService } from './llm/llm.service';
import { StorageModule } from '../storage/storage.module';
import { AiOrchestratorService } from './orchestrator.service';
import { ProviderConfig, GlobalConfig } from '../database/entities';

// NOTE: summarize.md lists Jimeng/Sora/LLM as direct services; the platform now routes
// AI calls through an OpenAI-compatible gateway (AiOrchestratorService) for maintainability.
// Legacy providers remain available for compatibility and future direct integrations.
@Module({
  imports: [ConfigModule, StorageModule, TypeOrmModule.forFeature([ProviderConfig, GlobalConfig])],
  providers: [JimengService, SoraService, LLMService, AiOrchestratorService],
  exports: [JimengService, SoraService, LLMService, AiOrchestratorService],
})
export class AIServiceModule {}
