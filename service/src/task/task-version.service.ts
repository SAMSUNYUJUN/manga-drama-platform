/**
 * Task version service
 * @module task
 */

import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Task, TaskVersion, User } from '../database/entities';
import { CreateTaskVersionDto } from './dto';
import { TaskStage, UserRole } from '@shared/constants';

@Injectable()
export class TaskVersionService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(TaskVersion)
    private versionRepository: Repository<TaskVersion>,
  ) {}

  async createVersion(taskId: number, dto: CreateTaskVersionDto, user: User): Promise<TaskVersion> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }
    if (task.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only create versions for your own tasks');
    }

    return await this.dataSource.transaction(async (manager) => {
      const lastVersion = await manager
        .getRepository(TaskVersion)
        .createQueryBuilder('version')
        .where('version.taskId = :taskId', { taskId })
        .orderBy('version.version', 'DESC')
        .getOne();

      const nextVersionNumber = lastVersion ? lastVersion.version + 1 : 1;
      const version = manager.getRepository(TaskVersion).create({
        taskId,
        version: nextVersionNumber,
        stage: TaskStage.SCRIPT_UPLOADED,
        metadataJson: dto.metadata ? JSON.stringify(dto.metadata) : null,
      });
      const saved = await manager.getRepository(TaskVersion).save(version);

      task.currentVersionId = saved.id;
      await manager.getRepository(Task).save(task);

      return saved;
    });
  }

  async listVersions(taskId: number, user: User): Promise<TaskVersion[]> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }
    if (task.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only view your own task versions');
    }

    return await this.versionRepository.find({
      where: { taskId },
      order: { version: 'DESC' },
    });
  }

  async getVersion(taskId: number, versionId: number, user: User): Promise<TaskVersion> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }
    if (task.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only view your own task versions');
    }

    const version = await this.versionRepository.findOne({
      where: { id: versionId, taskId },
    });
    if (!version) {
      throw new NotFoundException(`TaskVersion with ID ${versionId} not found`);
    }
    return version;
  }
}
