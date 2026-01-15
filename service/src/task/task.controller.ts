/**
 * 任务控制器
 * @module task
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { TaskService, TaskStats } from './task.service';
import { TaskVersionService } from './task-version.service';
import { CreateTaskDto, UpdateTaskDto, QueryTaskDto, CreateTaskVersionDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../common/decorators';
import { User, Task } from '../database/entities';
import { ApiResponse, PaginatedResponse, TaskDetail, TaskVersion } from '@shared/types';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly taskVersionService: TaskVersionService,
  ) {}

  /**
   * 获取任务统计
   * GET /api/tasks/stats
   */
  @Get('stats')
  async getStats(@CurrentUser() user: User): Promise<ApiResponse<TaskStats>> {
    const data = await this.taskService.getStats(user);
    return {
      success: true,
      data,
      message: 'Task stats retrieved successfully',
    };
  }

  /**
   * 创建任务
   * POST /api/tasks
   */
  @Post()
  async create(
    @Body() createTaskDto: CreateTaskDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<Task>> {
    const data = await this.taskService.create(createTaskDto, user);
    return {
      success: true,
      data,
      message: 'Task created successfully',
    };
  }

  /**
   * 获取任务列表
   * GET /api/tasks
   */
  @Get()
  async findAll(
    @Query() queryDto: QueryTaskDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<PaginatedResponse<Task>>> {
    const data = await this.taskService.findAll(queryDto, user);
    return {
      success: true,
      data,
      message: 'Tasks retrieved successfully',
    };
  }

  /**
   * 获取任务详情
   * GET /api/tasks/:id
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<TaskDetail>> {
    const data = await this.taskService.findOne(id, user);
    return {
      success: true,
      data,
      message: 'Task retrieved successfully',
    };
  }

  /**
   * 更新任务
   * PATCH /api/tasks/:id
   */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<Task>> {
    const data = await this.taskService.update(id, updateTaskDto, user);
    return {
      success: true,
      data,
      message: 'Task updated successfully',
    };
  }

  /**
   * 删除任务
   * DELETE /api/tasks/:id
   */
  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<null>> {
    await this.taskService.remove(id, user);
    return {
      success: true,
      data: null,
      message: 'Task deleted successfully',
    };
  }

  /**
   * 创建任务版本
   * POST /api/tasks/:id/versions
   */
  @Post(':id/versions')
  async createVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateTaskVersionDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<TaskVersion>> {
    const data = await this.taskVersionService.createVersion(id, body, user);
    return {
      success: true,
      data,
      message: 'Task version created successfully',
    };
  }

  /**
   * 获取任务版本列表
   * GET /api/tasks/:id/versions
   */
  @Get(':id/versions')
  async listVersions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<TaskVersion[]>> {
    const data = await this.taskVersionService.listVersions(id, user);
    return {
      success: true,
      data,
      message: 'Task versions retrieved successfully',
    };
  }

  /**
   * 获取任务版本详情
   * GET /api/tasks/:id/versions/:versionId
   */
  @Get(':id/versions/:versionId')
  async getVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<TaskVersion>> {
    const data = await this.taskVersionService.getVersion(id, versionId, user);
    return {
      success: true,
      data,
      message: 'Task version retrieved successfully',
    };
  }
}
