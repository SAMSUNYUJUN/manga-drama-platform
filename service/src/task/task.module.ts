/**
 * 任务模块
 * @module task
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task, TaskVersion, WorkflowRun } from '../database/entities';
import { TaskService } from './task.service';
import { TaskVersionService } from './task-version.service';
import { TaskController } from './task.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Task, TaskVersion, WorkflowRun])],
  controllers: [TaskController],
  providers: [TaskService, TaskVersionService],
  exports: [TaskService, TaskVersionService],
})
export class TaskModule {}
