/**
 * 任务服务
 * @module task
 */

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskVersion, User } from '../database/entities';
import { CreateTaskDto, UpdateTaskDto, QueryTaskDto } from './dto';
import { TaskStatus, TaskStage, UserRole } from '@shared/constants';
import { PaginatedResponse, TaskDetail } from '@shared/types';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(TaskVersion)
    private versionRepository: Repository<TaskVersion>,
  ) {}

  /**
   * 创建任务（包含初始版本）
   */
  async create(createTaskDto: CreateTaskDto, user: User): Promise<Task> {
    // 创建任务
    const task = this.taskRepository.create({
      ...createTaskDto,
      userId: user.id,
      status: TaskStatus.PENDING,
    });

    const savedTask = await this.taskRepository.save(task);

    // 创建初始版本
    const version = this.versionRepository.create({
      taskId: savedTask.id,
      version: 1,
      stage: TaskStage.SCRIPT_UPLOADED,
    });

    const savedVersion = await this.versionRepository.save(version);

    // 更新任务的currentVersionId
    savedTask.currentVersionId = savedVersion.id;
    await this.taskRepository.save(savedTask);

    return savedTask;
  }

  /**
   * 查询任务列表（分页）
   */
  async findAll(queryDto: QueryTaskDto, user: User): Promise<PaginatedResponse<Task>> {
    const { status, userId, page = 1, limit = 20 } = queryDto;

    const query = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .where(user.role === UserRole.ADMIN ? '1=1' : 'task.userId = :userId', {
        userId: user.id,
      });

    if (userId && user.role === UserRole.ADMIN) {
      query.andWhere('task.userId = :userIdFilter', { userIdFilter: userId });
    }

    if (status) {
      query.andWhere('task.status = :status', { status });
    }

    query.orderBy('task.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [items, total] = await query.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取任务详情
   */
  async findOne(id: number, user: User): Promise<TaskDetail> {
    const task = await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .leftJoinAndSelect('task.currentVersion', 'currentVersion')
      .leftJoinAndSelect('task.versions', 'versions')
      .where('task.id = :id', { id })
      .getOne();

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // 权限检查：只能查看自己的任务或管理员
    if (task.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only view your own tasks');
    }

    return task as TaskDetail;
  }

  /**
   * 更新任务
   */
  async update(id: number, updateTaskDto: UpdateTaskDto, user: User): Promise<Task> {
    const task = await this.taskRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // 权限检查
    if (task.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own tasks');
    }

    Object.assign(task, updateTaskDto);
    return await this.taskRepository.save(task);
  }

  /**
   * 删除任务
   */
  async remove(id: number, user: User): Promise<void> {
    const task = await this.taskRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // 权限检查
    if (task.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only delete your own tasks');
    }

    await this.taskRepository.remove(task);
  }
}
