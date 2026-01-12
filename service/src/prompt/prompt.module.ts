/**
 * Prompt module
 * @module prompt
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromptTemplate, PromptTemplateVersion } from '../database/entities';
import { PromptService } from './prompt.service';
import { PromptController } from './prompt.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PromptTemplate, PromptTemplateVersion])],
  providers: [PromptService],
  controllers: [PromptController],
  exports: [PromptService],
})
export class PromptModule {}
