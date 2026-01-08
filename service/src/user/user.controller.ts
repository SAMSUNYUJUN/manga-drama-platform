/**
 * 用户控制器
 * @module user
 */

import { Controller, Get, Patch, Delete, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../common/decorators';
import { User } from '../database/entities';
import { ApiResponse } from '@shared/types';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * 获取用户详情
   * GET /api/users/:id
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<User>> {
    const data = await this.userService.findOne(id, user);
    return {
      success: true,
      data,
      message: 'User retrieved successfully',
    };
  }

  /**
   * 更新用户信息
   * PATCH /api/users/:id
   */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<User>> {
    const data = await this.userService.update(id, updateUserDto, user);
    return {
      success: true,
      data,
      message: 'User updated successfully',
    };
  }

  /**
   * 删除用户
   * DELETE /api/users/:id
   */
  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<null>> {
    await this.userService.remove(id, user);
    return {
      success: true,
      data: null,
      message: 'User deleted successfully',
    };
  }
}
