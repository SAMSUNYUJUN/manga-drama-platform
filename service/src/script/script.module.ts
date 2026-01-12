/**
 * Script module
 * @module script
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScriptService } from './script.service';
import { ScriptController } from './script.controller';
import { Asset, Task, TaskVersion } from '../database/entities';
import { StorageModule } from '../storage/storage.module';
import { AIServiceModule } from '../ai-service/ai-service.module';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, Task, TaskVersion]), StorageModule, AIServiceModule],
  controllers: [ScriptController],
  providers: [ScriptService],
  exports: [ScriptService],
})
export class ScriptModule {}
