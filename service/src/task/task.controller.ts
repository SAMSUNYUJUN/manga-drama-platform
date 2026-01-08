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
import { TaskService } from './task.service';
import { CreateTaskDto, UpdateTaskDto, QueryTaskDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../common/decorators';
import { User, Task } from '../database/entities';
import { ApiResponse, PaginatedResponse, TaskDetail } from '@shared/types';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

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
}
