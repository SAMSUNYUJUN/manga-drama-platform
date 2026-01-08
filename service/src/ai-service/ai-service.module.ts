/**
 * AI 服务模块
 * @module ai-service
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JimengService } from './jimeng/jimeng.service';
import { SoraService } from './sora/sora.service';
import { LLMService } from './llm/llm.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [ConfigModule, StorageModule],
  providers: [JimengService, SoraService, LLMService],
  exports: [JimengService, SoraService, LLMService],
})
export class AIServiceModule {}
